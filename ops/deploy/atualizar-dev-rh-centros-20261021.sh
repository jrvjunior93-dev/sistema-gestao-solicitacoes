#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=828ed2ecd6478df54ff859c306b2ffac1a9ea9c9
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
NODE
cd backend
node <<'NODE'
// Somente leitura da configuracao; nao carregar app/models nem executar DDL.
require('./src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica habilitada no ambiente DEV. Nada atualizado.');
NODE
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_instalada" HEAD
git merge-base --is-ancestor "$base_dev" "$versao_dev"
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json
# package.json muda somente para adicionar os dois comandos de QA, sem dependencias.
git show "$versao_dev:backend/scripts/validarDeployRhCentrosDev.js" |
  node - --pacotes "$base_instalada" "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/src \
  ':(exclude)backend/src/services/rhDemissaoConclusaoDomain.js' \
  ':(exclude)backend/src/services/rhSolicitacaoService.js' \
  ':(exclude)backend/src/services/rhSolicitacaoConsultaDomain.js' \
  ':(exclude)backend/src/services/rhSolicitacaoPaginaService.js' \
  ':(exclude)backend/src/services/rhService.js' \
  ':(exclude)backend/src/controllers/RhSolicitacaoController.js' \
  ':(exclude)backend/src/routes.js' \
  ':(exclude)backend/src/services/centroCustoDistribuicaoService.js' \
  ':(exclude)backend/src/controllers/SolicitacaoCentroCustoDistribuicaoController.js' \
  ':(exclude)backend/src/controllers/DistribuicaoCentroCustoRelatorioController.js'
git diff --quiet "$base_dev" "$versao_dev" -- frontend/src \
  ':(exclude)frontend/src/pages/RhDpPessoal.jsx' \
  ':(exclude)frontend/src/pages/RhDpPessoalSolicitacoes.jsx' \
  ':(exclude)frontend/src/services/rhDp.js' \
  ':(exclude)frontend/src/pages/NovaSolicitacao.jsx' \
  ':(exclude)frontend/src/components/obras/DistribuicaoCentroCustoConfig.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroResultadoCentrosCusto.jsx' \
  ':(exclude)frontend/src/pages/FinanceiroRelatorios.jsx'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployRhCentrosDev.js
for arquivo in src/services/rhDemissaoConclusaoDomain.js src/services/rhSolicitacaoService.js \
  src/services/rhSolicitacaoConsultaDomain.js src/services/rhSolicitacaoPaginaService.js src/services/rhService.js \
  src/controllers/RhSolicitacaoController.js src/routes.js src/services/centroCustoDistribuicaoService.js \
  src/controllers/SolicitacaoCentroCustoDistribuicaoController.js src/controllers/DistribuicaoCentroCustoRelatorioController.js; do
  node --check "$arquivo"
done
# Modelos/API isolados: nao concluem RH real nem criam solicitacoes ou titulos.
for teste in validarRhDemissaoConclusao.js validarDistribuicaoCentroCustoDestinos.js \
  validarRhAdmissaoDiaria.js validarRhColaboradorContatos.js validarRhConsultaSalario.js \
  validarRhMovimentacoesDocumentais.js validarRhPedidoTiposDocumento.js validarRhDocumentosPacote.js \
  validarAdiantamentoCentroCusto.js validarAdiantamentoFavorecidos.js validarCompraCentroCusto.js \
  validarPerformanceFilaDp.js validarRhPagamentoEnvioParcial.js; do
  timeout 120s node "scripts/$teste"
done
timeout 120s node scripts/validarRhPessoalFluxo.js --transferencias
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
echo 'DEV atualizado: demissao/conclusao DP e destinos gerenciais de centros. Sem migration/dependencias/.env/flags alterados. Homologue somente em DEV.'
