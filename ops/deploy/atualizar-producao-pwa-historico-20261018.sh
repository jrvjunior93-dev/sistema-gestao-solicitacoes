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

# Checar processo e impedir restart automatico durante a troca de arquivos.
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'
  || (p.PORT !== undefined && Number(p.PORT) !== 8000) || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) {
  throw Error('PM2 PRODUCAO/porta/watch diverge. Nada atualizado.');
}
NODE
env_hash_prod="$(sha256sum backend/.env)"
cd backend
# Somente leitura: qualquer migration pendente impede este deploy sem DDL.
timeout 45s node scripts/verificarPwaPeriodoProducao.js --verificar
cd ..
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor 2e1466295fa10ae521f8c75fb911366ebf03d59b "$versao_prod"
# Garantir que todo o codigo funcional e o homologado no DEV.
git diff --quiet 2e1466295fa10ae521f8c75fb911366ebf03d59b "$versao_prod" -- \
  frontend backend/src backend/server.js backend/migrations backend/package-lock.json
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
node scripts/validarDeployPwaHistoricoProducao.js
node scripts/validarDeployPwaPeriodoProducao.js
node scripts/validarFilaRemetente.js
node scripts/validarTitulosExcluidosAutorizacao.js
node scripts/validarPainelAutorizacoes.js
node scripts/validarFilaDiretaProprietario.js
node scripts/validarBloqueioProprietario.js
node scripts/validarAnaliseProprietario.js
node scripts/validarPermissoesFinanceiroRota.js
timeout 45s node scripts/verificarPwaPeriodoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"

# Conservar ambiente PM2; nao propagar confirmacoes temporarias ou flag DDL.
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
echo 'PRODUCAO atualizada; sem migration ou restauracao de titulos. .env/PILOT/TLS/sessao12h preservados; DEV nao alterado.'
