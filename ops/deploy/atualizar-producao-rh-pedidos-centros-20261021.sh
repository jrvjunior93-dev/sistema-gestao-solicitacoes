#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao PRODUCAO interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as guardas." >&2' ERR
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
base_prod=80df65347b2a9d4a491f9516c087e0767dd2ecb1
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer
env_hash_prod="$(sha256sum backend/.env)"
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'
  || p.status !== 'online' || (p.PORT !== undefined && Number(p.PORT) !== 8000)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 PRODUCAO/porta/watch diverge. Nada atualizado.');
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica deve permanecer desabilitada.');
require('node:sqlite');
NODE
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor "$base_prod" HEAD
git merge-base --is-ancestor HEAD "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations backend/package-lock.json frontend/package-lock.json
# Somente tres novos comandos de QA; dependencias e scripts antigos intactos.
git show "$versao_prod:backend/scripts/validarDeployRhPedidosCentrosProducao.js" |
  node - --pacotes "$base_prod" "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/src \
  ':(exclude)backend/src/controllers/DistribuicaoCentroCustoRelatorioController.js' \
  ':(exclude)backend/src/controllers/PedidoCompraController.js' \
  ':(exclude)backend/src/controllers/RhSolicitacaoController.js' \
  ':(exclude)backend/src/controllers/SolicitacaoCentroCustoDistribuicaoController.js' \
  ':(exclude)backend/src/observability/pedidoCompraOperacao.js' \
  ':(exclude)backend/src/routes.js' \
  ':(exclude)backend/src/services/centroCustoDistribuicaoService.js' \
  ':(exclude)backend/src/services/pedidoCompraService.js' \
  ':(exclude)backend/src/services/rhDemissaoConclusaoDomain.js' \
  ':(exclude)backend/src/services/rhService.js' \
  ':(exclude)backend/src/services/rhSolicitacaoConsultaDomain.js' \
  ':(exclude)backend/src/services/rhSolicitacaoPaginaService.js' \
  ':(exclude)backend/src/services/rhSolicitacaoService.js' \
  ':(exclude)backend/src/validators/rhValidators.js'
git diff --quiet "$base_prod" "$versao_prod" -- frontend/src \
  ':(exclude)frontend/src/components/obras/DistribuicaoCentroCustoConfig.jsx' \
  ':(exclude)frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroRelatorios.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroResultadoCentrosCusto.jsx' \
  ':(exclude)frontend/src/pages/NovaSolicitacao.jsx' \
  ':(exclude)frontend/src/pages/RhDpPessoal.jsx' \
  ':(exclude)frontend/src/pages/RhDpPessoalSolicitacoes.jsx' \
  ':(exclude)frontend/src/services/rhDp.js'
# Verificadores JA instalados. Identidade/TLS/schema/sessao/flags em leitura.
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployRhPedidosCentrosProducao.js
for arquivo in src/controllers/DistribuicaoCentroCustoRelatorioController.js \
  src/controllers/PedidoCompraController.js src/controllers/RhSolicitacaoController.js \
  src/controllers/SolicitacaoCentroCustoDistribuicaoController.js \
  src/observability/pedidoCompraOperacao.js src/routes.js \
  src/services/centroCustoDistribuicaoService.js src/services/pedidoCompraService.js \
  src/services/rhDemissaoConclusaoDomain.js src/services/rhService.js \
  src/services/rhSolicitacaoConsultaDomain.js src/services/rhSolicitacaoPaginaService.js \
  src/services/rhSolicitacaoService.js src/validators/rhValidators.js; do
  node --check "$arquivo"
done
# Servicos/controller/modelos em memoria; nao conclui RH ou reabre pedidos reais.
for teste in validarRhDemissaoConclusao.js validarRhAdmissaoDiaria.js \
  validarRhColaboradorContatos.js validarRhConsultaSalario.js validarRhDocumentosPacote.js \
  validarRhPagamentoEnvioParcial.js validarPerformanceFilaDp.js \
  validarDistribuicaoCentroCustoDestinos.js validarAdiantamentoCentroCusto.js \
  validarPedidoReabertura.js validarPrevisaoEntregaCotacao.js validarCompraRemanejamento.js \
  validarComprasPerformanceFases.js validarPedidoEntregas.js validarPedidoEntregasAcesso.js \
  validarCompraOfertaSaldoMesmoFornecedor.js validarEncerramentoSemPedidoHistorico.js \
  validarAcessoPedidosEscopo.js validarAutorizacaoSelecao.js validarCartaoParcelamentoBaixa.js \
  validarPermutasRelatorio.js validarPeriodoRegistroSolicitacoes.js; do
  timeout 120s node "scripts/$teste"
done
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
systemctl is-active --quiet fluxy-prod-db-backup.timer
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
echo 'PRODUCAO atualizada: demissoes DP/query RH, destinos gerenciais e reabertura/fechamento/logs de pedidos. DEV nao alterado; sem DDL/dependencias/.env/flags/memoria ou operacoes financeiras automaticas.'
