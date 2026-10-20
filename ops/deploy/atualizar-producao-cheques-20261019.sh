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
git merge-base --is-ancestor 9e4faf4e75dbf9c59c01eaee742f125b4e5dd315 HEAD
git merge-base --is-ancestor e01e7bbf7ca35a99fa81f0ac387a5b6a23eb20a8 "$versao_prod"
git merge-base --is-ancestor 1f02c745558cabf465d84ef4b0e92e9c27f09f23 "$versao_prod"
git diff --quiet 9e4faf4e75dbf9c59c01eaee742f125b4e5dd315 "$versao_prod" -- \
  backend/migrations backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json

# Guardas JA instaladas na main9e4 antes do merge: PM2/watch, UUID, TLS,
# schema sem pendencias, sessao 12h e flags. Nao aplicar migration/configuracao.
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
node scripts/validarDeployChequesProducao.js
node scripts/validarDatasCheques.js
node scripts/validarChequesLoteContrato.js
node scripts/validarFilaLiquidacaoRateada.js
node scripts/validarCarteiraChequesBaixaComposta.js
node scripts/validarFilaBaixaComposta.js
node scripts/validarCartaoParcelamentoBaixa.js
node scripts/validarBloqueioProprietario.js
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
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada: cheques com descontos e contrato. Sem migration/baixa automatica; .env/PILOT/TLS/12h preservados. DEV nao alterado.'
