#!/usr/bin/env bash
set -euo pipefail
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer
env_hash_prod="$(sha256sum backend/.env)"
cd backend
# Disponivel na main antiga: identidade/PM2/watch/TLS/PILOT/12h/schema,
# SEM importar nenhum verificador novo antes do merge.
timeout 45s node scripts/promoverSchemaProducao20261018.js --concluido
cd ..
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor db1d2253c7ee12cb6e13cf6e61ad7a40a8154987 "$versao_prod"
# Runtime, dependencias e migrations exatamente como homologado no DEV.
git diff --quiet db1d2253c7ee12cb6e13cf6e61ad7a40a8154987 "$versao_prod" -- \
  backend/src frontend/src backend/server.js backend/migrations \
  backend/package-lock.json frontend/package-lock.json
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
node scripts/validarDeployFinanceiroProducao20261019.js
node scripts/validarPreflightFinanceiroProducao20261019.js
npm run test:cartao-parcelamento-baixa
npm run test:fila-multiplas-fontes
node scripts/validarTituloCancelamento.js
node scripts/validarSobreposicaoTitulos.js
node scripts/validarTitulosCompartilhados.js
node scripts/validarTituloRenegociacaoVinculos.js
node scripts/validarTituloRenegociacaoSincronizacao.js
node scripts/validarCartaoOpcionalSolicitacao.js
node scripts/validarCompraCentroCusto.js
node scripts/validarPermissoesFinanceiroRota.js
node ../frontend/scripts/validarJanelaFila.mjs
# Schema ja registrado em producao no preflight do operador: NAO executar DDL.
# Qualquer pendencia ou estrutura incompleta interrompe antes do restart.
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 45s node scripts/promoverSchemaProducao20261018.js --concluido
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada; nenhuma migration ou regularizacao financeira executada. .env/PILOT/TLS/12h preservados; DEV nao alterado.'
