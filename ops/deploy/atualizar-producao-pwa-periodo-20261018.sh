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

# Verificar antes de alterar arquivos: sem watch/restart automatico.
node <<'NODE'
const cp=require('node:child_process');
const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>p.name==='backend-solicitacoes');
const p=ps[0]?.pm2_env;
if(ps.length!==1||p?.pm_exec_path!=='/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'
  ||(p.PORT!==undefined&&Number(p.PORT)!==8000)||(p.watch&&(!Array.isArray(p.watch)||p.watch.length)))throw Error('PM2 PRODUCAO/porta/watch diverge. Nada atualizado.');
NODE
env_hash_prod="$(sha256sum backend/.env)"
cd backend
# Release anterior deve estar concluido. Sem autorizar DDL antigo ou novo.
timeout 45s node scripts/promoverSchemaProducao20261018.js --concluido
cd ..
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor 957ebf8528900904274151d3f9b3a54c9bed17dd "$versao_prod"
# Codigo funcional deve ser exatamente o homologado no DEV.
git diff --quiet 957ebf8528900904274151d3f9b3a54c9bed17dd "$versao_prod" -- \
  frontend backend/src backend/server.js backend/migrations backend/package-lock.json
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
npm run test:deploy-pwa-periodo-producao
node scripts/validarPainelAutorizacoes.js
node scripts/validarFilaDiretaProprietario.js
npm run test:pwa-rejeicao-fila
npm run test:rhdp-admissao-documentos
timeout 45s node scripts/verificarPwaPeriodoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"

# Sem --update-env: preservar o ambiente persistente. Nunca pm2 all/backend-dev.
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 45s node scripts/verificarPwaPeriodoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada; sem migration nova. .env/TLS/PILOT/sessao12h preservados; DEV nao alterado.'
