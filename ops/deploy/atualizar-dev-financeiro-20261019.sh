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
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'
  || (p.PORT !== undefined && Number(p.PORT) !== 8001) || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) {
  throw Error('PM2 DEV/porta/watch diverge. Nada atualizado.');
}
NODE
cd backend
# Confere identidade DEV, UUID, schema, flags e sessao; nao grava configuracao.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor HEAD "$versao_dev"
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
cd backend
npm ci --omit=dev
# Este pacote nao possui migration nova. Pendencia interrompe sem aplicar.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
node scripts/validarDeployFinanceiroDev20261019.js
npm run test:fila-multiplas-fontes
npm run test:titulo-cancelamento
node scripts/validarCompraCentroCusto.js
node scripts/validarCompraCriacaoTodasObras.js
node scripts/validarCartaoOpcionalSolicitacao.js
node scripts/validarTituloDesvincularFatura.js
node scripts/validarPermissoesFinanceiroRota.js
node ../frontend/scripts/validarJanelaFila.mjs
# SELECT/EXPLAIN em transacao READ ONLY no MySQL DEV, com rollback final.
timeout 120s node scripts/verificarPermutasMySqlDev.js --verificar
# Preserva ambiente e flags do processo; nao importa env do terminal.
pm2 restart backend-dev
timeout 45s node scripts/configurarSessao12hDev.js --verificar
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
git log -1 --oneline
echo 'DEV atualizado. Sem migration/configuracao alterada. Homologar multiplas fontes, centros de custo e cancelamento.'
