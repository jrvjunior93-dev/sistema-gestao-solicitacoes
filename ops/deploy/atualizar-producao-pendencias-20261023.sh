#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao PRODUCAO interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as guardas." >&2' ERR
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
base_prod=fe66315160468b02651a0e6abddfea76050a9ea5
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica deve permanecer desabilitada.');
require('node:sqlite');
NODE
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor "$base_prod" HEAD
git merge-base --is-ancestor HEAD "$versao_prod"
# Inventario exato: duas migrations aditivas, runtime igual ao DEV promovido,
# dependencias e scripts MAIN preservados. Sem copiar snapshot DEV sobre main.
git show "$versao_prod:backend/scripts/validarDeployPendenciasProducao20261023.js" |
  node - --inventario "$base_prod" "$versao_prod"
cd backend
# Preflight anterior ao checkout: somente leitura. Tambem admite retomada do
# mesmo pacote ja atualizado mas ainda com uma/das duas migrations pendentes.
node <<'NODE'
(async () => {
  const fs = require('node:fs'), cp = require('node:child_process');
  const { env, validateRequiredEnv } = require('./src/config/env');
  const db = require('./src/database');
  try {
    await require('./scripts/promoverSchemaProducao20261018').conferirProducao({
      cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db, execFileSync: cp.execFileSync });
    const state = await require('./src/database/runMigrations').getMigrationState();
    const permitidas = ['202610220001_titulo_negociacao_pagamento.js', '202610220002_baixa_composta_estornos_cheques.js'];
    if (!state.tableExists || state.pending.some(nome => !permitidas.includes(nome))) throw Error('Schema fora do pacote.');
    console.log('Preflight PROD: identidade/TLS/sessao/flags e pendencias permitidas conferidos. Somente leitura.');
  } finally { await db.close(); }
})().catch(error => { console.error('PREFLIGHT PROD INTERROMPIDO. Confira ambiente/schema sem compartilhar segredos. Codigo:', error.original?.code || error.code || error.name); process.exitCode = 1; });
NODE
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployPendenciasProducao20261023.js
node --check scripts/aplicarMigrationsPendenciasProducao20261023.js
for teste in validarCompraDiretaCredorObrigatorio.js validarTituloNegociacaoPagamento.js \
  validarTituloRenegociacaoService.js validarDevolucaoChequesComposta.js \
  validarRecargaSaldoOrigens.js validarFilaDestinatarios.js validarTituloDadosPagamento.js \
  validarMedicaoFavorecidos.js validarMedicaoRecargaFluxoPagamento.js validarRhTicketPix.js \
  validarFilaComprovantePendente.js validarFilaFiltrosDp.js validarFilaPaginacao.js \
  validarFilaBaixaComposta.js validarFilaLiquidacaoRateada.js validarFilaBaixaEstorno.js \
  validarCarteiraChequesBaixaComposta.js validarComercialChequeQuitacao.js \
  validarSegurancaAcessoDireto.js validarFilaPagamentoSolicitacaoAcesso.js \
  validarTituloCancelamento.js validarOfxMatchesExclusivos.js validarFormaPrevistaContratoReceber.js; do
  timeout 120s node "scripts/$teste"
done
# SOMENTE as duas colunas JSON nullable; sem backfill/regularizacao/baixa.
systemctl is-active --quiet fluxy-prod-db-backup.timer
timeout 120s node scripts/aplicarMigrationsPendenciasProducao20261023.js --verificar
timeout 300s node scripts/aplicarMigrationsPendenciasProducao20261023.js --aplicar
timeout 120s node scripts/aplicarMigrationsPendenciasProducao20261023.js --concluido
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
timeout 120s node scripts/aplicarMigrationsPendenciasProducao20261023.js --concluido
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada. Confira Compra Direta, negociacao, cheques, recarga e dados de pagamento. Nenhuma baixa/estorno real executado pelo roteiro; DEV preservado.'
