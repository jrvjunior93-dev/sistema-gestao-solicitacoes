#!/usr/bin/env bash
# Exclusivo DEV: projecoes de leitura, sem migrations ou instalacao de pacotes.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=5123de39c4eb5ad6ac1131d3719fc69440648196
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
# Leitura apenas: UUID/banco/porta/PM2/flags/sessao/schema DEV ja existentes.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package-lock.json frontend/package-lock.json backend/migrations
# Manifests so podem diferir nos scripts de QA, nao nas dependencias/runtime.
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
for (const arquivo of ['backend/package.json', 'frontend/package.json']) {
  const manifesto = ref => {
    const { scripts, ...resto } = JSON.parse(cp.execFileSync('git', ['show', `${ref}:${arquivo}`], { encoding: 'utf8' }));
    return resto;
  };
  assert.deepEqual(manifesto(base), manifesto(versao), 'Dependencias/runtime divergentes. Pare para revisar.');
}
NODE
git diff --quiet "$base_dev" "$versao_dev" -- backend/src/services/tituloFinanceiroService.js backend/src/services/authorizationService.js backend/src/services/instrucaoFinanceiraFavorecidoService.js backend/src/services/medicaoContratoService.js backend/src/services/tituloRenegociacaoService.js backend/src/services/tituloCompartilhadoPagamento.js
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployFilaDestinatariosDev.js
node --check src/services/pagamentoFilaDestinatarioService.js
node --check src/services/pagamentoManualFilaService.js
node --check src/controllers/TituloFinanceiroController.js
# QAs isolados: nenhum titulo/baixa/medicao/historico real e alterado.
for teste in validarFilaDestinatarios.js validarTituloDadosPagamento.js \
  validarFilaFiltrosDp.js validarFilaPaginacao.js validarFilaComprovantePendente.js \
  validarFilaBaixaComposta.js validarFilaLiquidacaoRateada.js validarFilaBaixaEstorno.js \
  validarMedicaoFavorecidos.js validarMedicaoRecargaFluxoPagamento.js \
  validarTituloNegociacaoPagamento.js validarTituloCancelamento.js \
  validarSegurancaAcessoDireto.js validarFilaPagamentoSolicitacaoAcesso.js; do
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
echo 'DEV atualizado. Confira favorecido/PIX na fila e no detalhe. Nao refaca a baixa do titulo quitado. Nenhuma acao em producao.'
