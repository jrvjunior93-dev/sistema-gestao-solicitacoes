#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-dev-deploy.lock)"
flock -n 9
env_hash_dev="$(sha256sum backend/.env)"
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'
  || (p.PORT !== undefined && Number(p.PORT) !== 8001) || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 DEV/porta/watch diverge. Nada atualizado.');
NODE
cd backend
# Guardas existentes no db1: nao importar arquivo novo antes do merge.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor HEAD "$versao_dev"
git merge-base --is-ancestor db1d2253c7ee12cb6e13cf6e61ad7a40a8154987 HEAD
git diff --quiet db1d2253c7ee12cb6e13cf6e61ad7a40a8154987 "$versao_dev" -- backend/migrations
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
# Nenhuma migration nova: pendencia interrompe, sem execucao de DDL.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
node scripts/validarAnaliseProprietario.js
node scripts/validarReenvioAutorizacaoPush.js
node scripts/validarDeployAutorizacaoReenvioDev.js
node scripts/validarPainelAutorizacoes.js
node scripts/validarTitulosExcluidosAutorizacao.js
node ../frontend/scripts/validarJanelaFila.mjs
timeout 60s node scripts/verificarReenvioAutorizacaoDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 60s node scripts/verificarReenvioAutorizacaoDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado. Sem migration/.env/PILOT alterados; producao nao alterada. Testar login real, avisos e reenvio.'
