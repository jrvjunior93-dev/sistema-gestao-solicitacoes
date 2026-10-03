#!/usr/bin/env bash
# Backup logico do MySQL de producao. Configuracao e segredos ficam fora do Git.
set -Eeuo pipefail
umask 077

required=(BACKUP_DB_NAME BACKUP_MYSQL_DEFAULTS_FILE BACKUP_RCLONE_CONFIG BACKUP_RCLONE_REMOTE BACKUP_WORK_DIR)
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
if [[ ! "$BACKUP_DB_NAME" =~ ^[a-zA-Z0-9_]+$ ]]; then
  printf 'Nome do banco invalido.\n' >&2
  exit 2
fi
for path in "$BACKUP_MYSQL_DEFAULTS_FILE" "$BACKUP_RCLONE_CONFIG"; do
  if [[ ! -f "$path" ]]; then
    printf 'Arquivo de configuracao nao encontrado: %s\n' "$path" >&2
    exit 2
  fi
done

for bin in mysqldump gzip sha256sum rclone flock; do
  command -v "$bin" >/dev/null || { printf 'Binario ausente: %s\n' "$bin" >&2; exit 2; }
done

mkdir -p -- "$BACKUP_WORK_DIR"
exec 9>"$BACKUP_WORK_DIR/.backup.lock"
flock -n 9 || { printf 'Outro backup esta em andamento.\n' >&2; exit 1; }

stamp="$(TZ=America/Sao_Paulo date +%Y%m%d-%H%M%S)"
name="fluxy-prod-db-${stamp}.sql.gz"
partial="$BACKUP_WORK_DIR/.${name}.partial"
local_file="$BACKUP_WORK_DIR/$name"
remote_file="$BACKUP_RCLONE_REMOTE/$name"
trap 'rm -f -- "$partial"' EXIT

mysqldump --defaults-extra-file="$BACKUP_MYSQL_DEFAULTS_FILE" \
  --single-transaction --quick --routines --events --triggers \
  --hex-blob --no-tablespaces "$BACKUP_DB_NAME" | gzip -1 >"$partial"
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

# Apaga somente dumps com prefixo controlado e idade superior a 30 dias,
# depois de uma nova copia ter sido conferida. Nao usa sync.
rclone --config "$BACKUP_RCLONE_CONFIG" delete "$BACKUP_RCLONE_REMOTE" \
  --min-age 30d --include 'fluxy-prod-db-*.sql.gz'
