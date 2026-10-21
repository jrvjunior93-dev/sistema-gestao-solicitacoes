#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie esta saida." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=2d161b85efd1e673ffcf7c36b25b94a1fc9a5122
base_instalada=828ed2ecd6478df54ff859c306b2ffac1a9ea9c9
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
NODE
cd backend
node <<'NODE'
// Leitura da configuracao, sem carregar app/models ou executar DDL.
require('./src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica habilitada no DEV. Nada atualizado.');
NODE
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_instalada" HEAD
git merge-base --is-ancestor "$base_dev" "$versao_dev"
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json
# Somente comandos de QA novos (inclui o pacote DP/centros ja publicado).
git show "$versao_dev:backend/scripts/validarDeployPedidoReaberturaDev.js" |
  node - --pacotes "$base_instalada" "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/src \
  ':(exclude)backend/src/services/pedidoCompraService.js' \
  ':(exclude)backend/src/controllers/PedidoCompraController.js' \
  ':(exclude)backend/src/observability/pedidoCompraOperacao.js'
git diff --quiet "$base_dev" "$versao_dev" -- frontend/src \
  ':(exclude)frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployPedidoReaberturaDev.js
for arquivo in src/services/pedidoCompraService.js src/controllers/PedidoCompraController.js \
  src/observability/pedidoCompraOperacao.js; do
  node --check "$arquivo"
done
# Modelos/API simulados ou validadores puros. Nao reabre pedidos nem cria titulos reais.
for teste in validarPedidoReabertura.js validarPrevisaoEntregaCotacao.js \
  validarCompraRemanejamento.js validarComprasPerformanceFases.js \
  validarPedidoEntregas.js validarPedidoEntregasAcesso.js \
  validarCompraOfertaSaldoMesmoFornecedor.js validarEncerramentoSemPedidoHistorico.js \
  validarRhDemissaoConclusao.js validarDistribuicaoCentroCustoDestinos.js; do
  timeout 120s node "scripts/$teste"
done
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
echo 'DEV atualizado: reabertura, fechamento fornecedor e logs PEDIDO_OPERACAO. Sem migration/dependencias/.env/flags/memoria alterados. Homologue somente em DEV.'
