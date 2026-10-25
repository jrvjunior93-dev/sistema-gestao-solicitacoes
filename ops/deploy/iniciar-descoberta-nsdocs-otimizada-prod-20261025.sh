#!/usr/bin/env bash
# Enviar por SSH/stdin. So inicia descoberta de metadados; nunca captura XMLs.
set -euo pipefail
umask 077
trap 'printf "%s\n" "NSDOCS_DESCOBERTA_NAO_INICIADA. Preserve planos e locks; envie a saida sem segredos." >&2' ERR

test "$#" -eq 3
test "$1" = --confirmar-descoberta-real
test "$2" = --commit
[[ "$3" =~ ^[a-f0-9]{40}$ ]]
test "$(/usr/bin/id -u)" = 1000
test "$(/usr/bin/uname -s)" = Linux
test -z "${NODE_OPTIONS-}"
test "${NODE_TLS_REJECT_UNAUTHORIZED-}" != 0
test "${CONFIRM_PROD_BACKUP-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER-}" = SIM
test "${CONFIRM_NSDOCS_PROD_CAPTURE-}" = SIM

BACKEND=/home/ubuntu/sistema-gestao-solicitacoes-main/backend
NODE_PROD=/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node
PRIVATE=/home/ubuntu/.config/fluxy-nsdocs-prod
PLAN=c456781c-4393-468b-858f-dbf220d8f215

cd -- "$BACKEND"
test "$(pwd -P)" = "$BACKEND"
test "$(/usr/bin/git --no-optional-locks branch --show-current)" = main
test "$(/usr/bin/git --no-optional-locks rev-parse HEAD)" = "$3"
/usr/bin/git --no-optional-locks diff --quiet
/usr/bin/git --no-optional-locks diff --cached --quiet
test "$(/usr/bin/readlink -f "$NODE_PROD")" = "$NODE_PROD"
test "$("$NODE_PROD" --version)" = v24.22.1
test -d "$PRIVATE"
test ! -L "$PRIVATE"
test "$(/usr/bin/readlink -f "$PRIVATE")" = "$PRIVATE"
test "$(/usr/bin/stat -c '%u:%a' "$PRIVATE")" = 1000:700
test -f "$PRIVATE/complement-$PLAN.json"
test ! -L "$PRIVATE/complement-$PLAN.json"
test "$(/usr/bin/stat -c '%u:%a' "$PRIVATE/complement-$PLAN.json")" = 1000:600
for lock in historical-plan.lock query.lock; do
  test ! -e "$PRIVATE/$lock"
  test ! -L "$PRIVATE/$lock"
done
/usr/bin/systemctl is-active --quiet fluxy-prod-db-backup.timer

# Conferencia local: fontes aplicadas, plano correto e automatico desligado.
(cd .. && "$NODE_PROD" ops/deploy/atualizar-prod-nsdocs-otimizacao-20261025.cjs conferir)

# mktemp cria exclusivamente; nenhuma credencial/corpo de resposta vai no log.
LOG=$(/usr/bin/mktemp "$PRIVATE/descoberta-$PLAN-XXXXXXXX.log")
test "$(/usr/bin/stat -c '%u:%a' "$LOG")" = 1000:600
/usr/bin/nohup /bin/bash -c '
  sleep 60
  "$1" scripts/nsdocsProdComplement.js --descobrir \
    --empresa-id 1 --cnpj 27123008000100 \
    --plano-id "$2" --max-consultas 10 --confirmar-chamada-real
  result=$?
  printf "\nNSDOCS_RODADA_ENCERRADA codigo=%s\n" "$result"
  exit "$result"
' fluxy-nsdocs-descoberta "$NODE_PROD" "$PLAN" </dev/null >"$LOG" 2>&1 &
JOB_PID=$!
printf 'NSDOCS_DESCOBERTA_DISPARADA pid=%s plano=%s\n' "$JOB_PID" "$PLAN"
printf 'LOG_PRIVADO=%s\n' "$LOG"
printf '%s\n' 'Aguarda 60s e executa ate 10 consultas. Confira o log/estado para saber se iniciou/concluiu. Nenhum XML e capturado.'
