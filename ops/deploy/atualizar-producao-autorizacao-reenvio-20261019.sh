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

git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor 72e628e86379f3f8a9f7a5b58979d9937d823c32 HEAD
git merge-base --is-ancestor 1393a4460ca83db433da2de337f3180d880ccc9e "$versao_prod"
git diff --quiet 72e628e86379f3f8a9f7a5b58979d9937d823c32 "$versao_prod" -- \
  backend/migrations backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json

# Disponivel na main72: guardas PM2/watch/identidade/TLS/12h/flags e schema
# ANTES de trocar arquivos. Nao importar aqui o novo verificador de reenvio.
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
node scripts/validarDeployAutorizacaoReenvioProducao.js
node scripts/validarAnaliseProprietario.js
node scripts/validarReenvioAutorizacaoPush.js
node scripts/validarPainelAutorizacoes.js
node scripts/validarTitulosExcluidosAutorizacao.js
node ../frontend/scripts/validarJanelaFila.mjs
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada. Sem migration ou envio automatico; .env/PILOT/TLS/12h preservados. DEV nao alterado.'
