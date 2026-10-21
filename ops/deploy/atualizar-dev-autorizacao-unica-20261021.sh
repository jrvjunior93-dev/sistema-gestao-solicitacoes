#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=771f804189a7559c05df3f6bc1fd06fe17a65e50
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
# Checagem ja instalada: nao depende do novo servico antes do fast-forward.
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
# Delta novo backend limitado ao fluxo autorizado; pacotes anteriores ja publicados.
git diff --quiet "$base_dev" "$versao_dev" -- backend/src \
  ':(exclude)backend/src/services/pagamentoAutorizacaoSelecaoService.js' \
  ':(exclude)backend/src/services/pagamentoAutorizacaoService.js' \
  ':(exclude)backend/src/services/pagamentoManualFilaService.js' \
  ':(exclude)backend/src/controllers/PagamentoAutorizacaoController.js' \
  ':(exclude)backend/src/routes.js'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployAutorizacaoUnicaDev.js
node --check src/services/pagamentoAutorizacaoSelecaoService.js
node --check src/services/pagamentoAutorizacaoService.js
node --check src/services/pagamentoManualFilaService.js
node --check src/controllers/PagamentoAutorizacaoController.js
node --check src/routes.js
# Suites isoladas: nao executam autorizacoes ou envios financeiros reais.
timeout 120s node scripts/validarAutorizacaoSelecao.js
timeout 120s node scripts/validarFilaDiretaProprietario.js
timeout 120s node scripts/validarBloqueioProprietario.js
timeout 120s node scripts/validarPainelAutorizacoes.js
timeout 120s node scripts/validarTitulosExcluidosAutorizacao.js
timeout 120s node scripts/validarReenvioAutorizacaoPush.js
timeout 120s node scripts/validarCartaoParcelamentoBaixa.js
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
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
echo 'DEV atualizado: autorizacao unica da selecao. Sem migration/dependencias/.env/flags alterados. Confira frontend DEV na Vercel e homologue lotes diferentes com passkey real.'
