#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=44ee71b28b712b47e40b2c5aafad981fe27673c2
base_instalada=93f75d67f773b9687bbf7acb9cf4664243f42c84
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica deve permanecer desabilitada.');
require('node:sqlite');
NODE
# Verificacao ja instalada; nao carregar arquivos novos antes do merge.
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_instalada" HEAD
git merge-base --is-ancestor "$base_dev" "$versao_dev"
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations \
  backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
# Em relacao ao pacote publicado anterior, apenas o controller pode mudar.
git diff --quiet "$base_dev" "$versao_dev" -- backend/src \
  ':(exclude)backend/src/controllers/SolicitacaoController.js'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployPeriodoRegistroDev.js
node scripts/validarPeriodoRegistroSolicitacoes.js
node scripts/validarSolicitacaoDataVencimento.js
node scripts/validarEdicaoDadosSolicitacao.js
node scripts/validarListaPreferencias.js
# Regressoes dos pacotes DEV ja publicados, inclusive se checkout estava atrasado.
node scripts/validarCartaoParcelamentoBaixa.js
node scripts/validarPermutasRelatorio.js
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
node frontend/scripts/validarPeriodoRegistroSolicitacoes.mjs
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado: periodo de registro das solicitacoes. Sem migration/dependencias/.env/flags alterados. Confira frontend DEV na Vercel e homologue a consulta no navegador.'
