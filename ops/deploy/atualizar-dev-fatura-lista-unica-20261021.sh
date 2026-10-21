#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=93f75d67f773b9687bbf7acb9cf4664243f42c84
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
  || p.status !== 'online' || (p.PORT !== undefined && Number(p.PORT) !== 8001)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 DEV/porta/watch diverge. Nada atualizado.');
NODE
# Guardas ja instaladas: nao importar scripts novos antes do merge.
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
# Pacote apenas de UI/docs/QA: backend financeiro e dependencias devem ser iguais.
git diff --quiet "$base_dev" "$versao_dev" -- backend/src backend/migrations \
  backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
node backend/scripts/validarDeployFaturaListaUnicaDev.js
node frontend/scripts/validarFaturaItensUnificados.mjs
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
curl --fail --show-error --silent --max-time 5 \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'Checkout DEV atualizado. Sem migration, instalacao de dependencias ou reinicio. Confira o deploy DEV da Vercel e a lista unica da fatura no navegador.'
