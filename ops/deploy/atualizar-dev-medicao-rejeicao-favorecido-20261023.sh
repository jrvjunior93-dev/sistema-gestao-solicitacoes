#!/usr/bin/env bash
# Exclusivo DEV: rejeicao da medicao e edicao do favorecido, migration aditiva unica.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
test "${CONFIRM_DEV_BACKUP:-}" = SIM || { echo 'Confira primeiro o backup DEV e confirme CONFIRM_DEV_BACKUP=SIM.' >&2; exit 1; }
base_dev=45513bfdaea56b3f9bf5772f0064f8ec583f9b11
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
# Ainda no codigo anterior, antes de qualquer mudanca: identidade/schema/sessao.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package-lock.json frontend/package-lock.json
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
const migrations = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/migrations'], { encoding: 'utf8' }).trim();
assert.equal(migrations, 'A\tbackend/migrations/202610230001_medicao_rejeicao_favorecido_titulo.js', 'Migration inesperada.');
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/src', 'frontend/src'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.deepEqual(arquivos, [
  'M\tbackend/src/constants/moduloPermissoes.js',
  'A\tbackend/src/controllers/MedicaoOperacoesController.js',
  'M\tbackend/src/models/ContratoMedicao.js',
  'M\tbackend/src/models/TituloFinanceiro.js',
  'M\tbackend/src/routes.js',
  'M\tbackend/src/services/contratoFluxoNovoService.js',
  'A\tbackend/src/services/favorecidoEdicaoAuditoriaService.js',
  'A\tbackend/src/services/favorecidoEdicaoService.js',
  'M\tbackend/src/services/financeiroRotaPermissoesService.js',
  'M\tbackend/src/services/instrucaoFinanceiraFavorecidoService.js',
  'M\tbackend/src/services/medicaoAtualContratoService.js',
  'M\tbackend/src/services/medicaoContratoService.js',
  'A\tbackend/src/services/medicaoOperacaoContextoService.js',
  'M\tbackend/src/services/medicaoPagamentoService.js',
  'A\tbackend/src/services/medicaoRejeicaoService.js',
  'M\tbackend/src/services/pagamentoAutorizacaoService.js',
  'M\tbackend/src/services/pagamentoFilaDestinatarioService.js',
  'M\tbackend/src/services/pagamentoFilaPesquisaDomain.js',
  'M\tbackend/src/services/pagamentoManualFilaService.js',
  'M\tbackend/src/services/paymentEligibilityService.js',
  'M\tbackend/src/services/tituloFinanceiroService.js',
  'A\tfrontend/src/components/contratos/RejeitarMedicao.jsx',
  'A\tfrontend/src/components/financeiro/FavorecidoEditor.jsx',
  'M\tfrontend/src/pages/FinanceiroTituloDetalhe.jsx',
  'M\tfrontend/src/pages/FinanceiroTituloEditar.jsx',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx',
  'A\tfrontend/src/services/medicaoOperacoes.js',
  'M\tfrontend/src/utils/filaPagamentoDestinatarios.mjs'
], 'Runtime fora dos ajustes autorizados. Pare para revisar.');
NODE
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
# QAs isolados antes de DDL/reinicio; sem alterar dados financeiros no banco.
for teste in validarDeployMedicaoRejeicaoFavorecidoDev.js validarMedicaoRejeicaoFavorecido.js \
  validarMedicaoValorPagamento.js validarMedicaoRecargaFluxoPagamento.js \
  validarContratoSaldoReprogramacao.js validarMedicaoFavorecidos.js validarContratoMedicaoEncerramento.js \
  validarGestaoContratosOperacional.js validarAprovacaoExclusivaContrato.js validarRetornoContratoAprovadoObra.js \
  validarPagamentosEngine.js validarAutorizacaoProprietarioPagamentos.js validarTituloNegociacaoPagamento.js \
  validarTituloCancelamento.js validarTituloDesvincularFatura.js validarFilaDestinatarios.js \
  validarTituloDadosPagamento.js validarPermissoesFinanceiroRota.js; do
  timeout 120s node "scripts/$teste"
done
timeout 120s node scripts/validarFilaFiltrosPesquisa.js --sem-sqlite
timeout 45s node scripts/aplicarMigrationMedicaoRejeicaoFavorecidoDev.js --verificar
timeout 120s node scripts/aplicarMigrationMedicaoRejeicaoFavorecidoDev.js --aplicar
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Preservar ambiente do PM2, sem propagar autorizacao temporaria de DDL.
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
echo 'DEV atualizado: teste rejeicao/nova medicao/favorecidos. Nenhuma acao em producao.'
