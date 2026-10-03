#!/usr/bin/env bash
# Backup logico do MySQL de producao. Configuracao e segredos ficam fora do Git.
set -Eeuo pipefail
umask 077

required=(BACKUP_DB_NAME BACKUP_DB_HOST BACKUP_EXPECTED_SERVER_UUID BACKUP_MYSQL_DEFAULTS_FILE BACKUP_RCLONE_CONFIG BACKUP_RCLONE_REMOTE BACKUP_WORK_DIR)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Configuracao obrigatoria ausente: %s\n' "$name" >&2
    exit 2
  fi
done

# O destino exato impede upload/prune acidental na raiz de um Drive.
if [[ "$BACKUP_RCLONE_REMOTE" != 'fluxy-crypt:producao/mysql' ]]; then
  printf 'Destino nao aprovado para backup de producao.\n' >&2
  exit 2
fi
if [[ "$BACKUP_DB_NAME" != 'gestao_solicitacoes' ||
      "$BACKUP_DB_HOST" != 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com' ||
      ! "$BACKUP_EXPECTED_SERVER_UUID" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]; then
  printf 'Identidade esperada do banco de producao invalida.\n' >&2
  exit 2
fi
if [[ "$BACKUP_MYSQL_DEFAULTS_FILE" != '/etc/fluxy/mysql-backup.cnf' ||
      "$BACKUP_RCLONE_CONFIG" != '/etc/fluxy/rclone.conf' ||
      "$BACKUP_WORK_DIR" != '/var/lib/fluxy-backup/mysql' ]]; then
  printf 'Caminhos de configuracao ou trabalho nao aprovados.\n' >&2
  exit 2
fi
for path in "$BACKUP_MYSQL_DEFAULTS_FILE" "$BACKUP_RCLONE_CONFIG"; do
  if [[ ! -f "$path" ]]; then
    printf 'Arquivo de configuracao nao encontrado: %s\n' "$path" >&2
    exit 2
  fi
done

for bin in mysql mysqldump gzip sha256sum rclone flock; do
  command -v "$bin" >/dev/null || { printf 'Binario ausente: %s\n' "$bin" >&2; exit 2; }
done

identity="$(mysql --defaults-file="$BACKUP_MYSQL_DEFAULTS_FILE" \
  --host="$BACKUP_DB_HOST" --user=fluxy_backup --ssl-mode=VERIFY_IDENTITY \
  --batch --skip-column-names \
  --execute="SELECT CONCAT_WS('|', @@GLOBAL.server_uuid, CURRENT_USER(), DATABASE())" \
  "$BACKUP_DB_NAME")"
expected_identity="${BACKUP_EXPECTED_SERVER_UUID}|fluxy_backup@172.31.23.63|${BACKUP_DB_NAME}"
if [[ "$identity" != "$expected_identity" ]]; then
  printf 'Conexao MySQL nao corresponde a producao esperada. Backup cancelado.\n' >&2
  exit 2
fi

mkdir -p -- "$BACKUP_WORK_DIR"
exec 9>"$BACKUP_WORK_DIR/.backup.lock"
flock -n 9 || { printf 'Outro backup esta em andamento.\n' >&2; exit 1; }

stamp="$(TZ=America/Sao_Paulo date +%Y%m%d-%H%M%S)"
name="fluxy-prod-db-${stamp}.sql.gz"
partial="$BACKUP_WORK_DIR/.${name}.partial"
local_file="$BACKUP_WORK_DIR/$name"
remote_file="$BACKUP_RCLONE_REMOTE/$name"
if [[ -e "$partial" || -e "$local_file" ]]; then
  printf 'Arquivo de backup com este horario ja existe; cancelando para nao sobrescrever.\n' >&2
  exit 2
fi
trap 'rm -f -- "$partial"' EXIT

mysqldump --defaults-file="$BACKUP_MYSQL_DEFAULTS_FILE" \
  --host="$BACKUP_DB_HOST" --user=fluxy_backup --ssl-mode=VERIFY_IDENTITY \
  --single-transaction --quick --routines --events --triggers \
  --hex-blob --no-tablespaces --set-gtid-purged=OFF \
  "$BACKUP_DB_NAME" | gzip -1 >"$partial"
test -s "$partial"
gzip -t "$partial"
mv -- "$partial" "$local_file"

local_hash="$(sha256sum "$local_file")"
local_hash="${local_hash%% *}"
rclone --config "$BACKUP_RCLONE_CONFIG" copyto "$local_file" "$remote_file"
remote_hash="$(rclone --config "$BACKUP_RCLONE_CONFIG" cat "$remote_file" | sha256sum)"
remote_hash="${remote_hash%% *}"
if [[ "$local_hash" != "$remote_hash" ]]; then
  printf 'Falha de verificacao: checksum remoto diferente.\n' >&2
  exit 1
fi

printf 'Backup conferido fora da EC2: %s sha256=%s\n' "$remote_file" "$local_hash"

# Apaga somente dumps diarios com timestamp e idade superior a 30 dias.
# A copia manual pre-promocao nao corresponde a este padrao. Nao usa sync.
rclone --config "$BACKUP_RCLONE_CONFIG" delete "$BACKUP_RCLONE_REMOTE" \
  --min-age 30d --include '/fluxy-prod-db-[0-9]*.sql.gz'
