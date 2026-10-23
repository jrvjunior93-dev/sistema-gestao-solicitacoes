#!/usr/bin/env bash
# Exclusivo DEV: leitura de filtros/rateio, sem migration ou novos pacotes.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica deve permanecer desabilitada.');
NODE
cd backend
node <<'NODE'
require('./src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica habilitada. Nada atualizado.');
NODE
# Preflight somente leitura: identidade/UUID/banco/PM2/flags/schema/sessao DEV.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package-lock.json frontend/package-lock.json backend/migrations
# Manifestos so mudam nos QAs; inventario fechado antes de atualizar o checkout.
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
for (const arquivo of ['backend/package.json', 'frontend/package.json']) {
  const manifesto = ref => {
    const { scripts, ...resto } = JSON.parse(cp.execFileSync('git', ['show', `${ref}:${arquivo}`], { encoding: 'utf8' }));
    return resto;
  };
  assert.deepEqual(manifesto(base), manifesto(versao), 'Dependencias/runtime divergentes. Pare para revisar.');
}
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/src', 'frontend/src'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.deepEqual(arquivos, [
  'M\tbackend/src/controllers/DetalheLayoutController.js',
  'M\tbackend/src/controllers/PagamentoManualFilaController.js',
  'M\tbackend/src/controllers/SolicitacaoController.js',
  'M\tbackend/src/routes.js',
  'A\tbackend/src/services/pagamentoFilaAutocompleteService.js',
  'M\tbackend/src/services/pagamentoFilaFiltrosDomain.js',
  'A\tbackend/src/services/pagamentoFilaPesquisaDomain.js',
  'M\tbackend/src/services/pagamentoManualFilaService.js',
  'M\tbackend/src/validators/paymentValidators.js',
  'A\tfrontend/src/components/financeiro/FiltrosFilaPagamentos.jsx',
  'M\tfrontend/src/components/ui/ApropriacaoAutocomplete.jsx',
  'M\tfrontend/src/pages/FinanceiroFilaPagamentos.jsx',
  'A\tfrontend/src/pages/SolicitacaoDetalhe/DistribuicaoGerencial.jsx',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/blocosDetalhe.js',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/index.jsx',
  'M\tfrontend/src/services/financeiro.js',
  'A\tfrontend/src/utils/distribuicaoGerencialSalva.mjs'
], 'Runtime fora dos dois ajustes autorizados. Pare para revisar.');
NODE
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployFiltrosDistribuicaoDev.js
node --check src/services/pagamentoFilaAutocompleteService.js
node --check src/services/pagamentoFilaPesquisaDomain.js
node --check src/services/pagamentoManualFilaService.js
node --check src/validators/paymentValidators.js
node --check src/controllers/SolicitacaoController.js
node --check src/routes.js
# Host pode nao dispor de node:sqlite. QAs de SQL/validacao rodam sem ele;
# os16casos da projecao SQLite ja foram executados no Node24 local.
timeout 120s node scripts/validarFilaFiltrosPesquisa.js --sem-sqlite
# QAs isolados, sem criar/editar titulos, solicitacoes ou historico no banco.
for teste in validarSolicitacaoDistribuicaoGerencial.js validarFilaFiltrosDp.js \
  validarFilaPaginacao.js validarPerformanceFilaDp.js validarFilaDestinatarios.js \
  validarFilaBaixaEstorno.js validarFilaComprovantePendente.js validarFilaBaixaComposta.js \
  validarFilaLiquidacaoRateada.js validarDistribuicaoCentroCustoDestinos.js \
  validarAdiantamentoCentroCusto.js validarSegurancaAcessoDireto.js; do
  timeout 120s node "scripts/$teste"
done
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Preservar ambiente do PM2; nao propagar permissao de DDL do terminal.
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado. Confira filtros/combinacoes/forma prevista e distribuicao gerencial salva. Nenhuma acao em producao.'
