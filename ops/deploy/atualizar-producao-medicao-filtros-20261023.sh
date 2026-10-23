#!/usr/bin/env bash
# Exclusivo PRODUCAO: duas migrations estruturais; COPY pode bloquear escritas.
set -euo pipefail
trap 'echo "Atualizacao PRODUCAO interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as guardas." >&2' ERR
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
test "${CONFIRM_PROD_MAINTENANCE:-}" = SIM
base_prod=4922ebad648bb8532f4ea55fcbe6052bb004f2f4
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
# QA portatil do alvo antes de instalar qualquer arquivo novo no checkout.
git show "$versao_prod:backend/scripts/validarDeployMedicaoFiltrosProducao20261023.js" |
  node - --inventario "$base_prod" "$versao_prod"
cd backend
# Na retomada, as duas migrations novas podem estar pendentes. A guarda
# antiga abaixo so confere ambiente/TLS/flags, sem exigir schema atualizado.
timeout 60s node <<'NODE'
const fs = require('node:fs'), cp = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
(async () => {
  await require('./scripts/promoverSchemaProducao20261018').conferirProducao({ cwd: fs.realpathSync(process.cwd()),
    env, validateRequiredEnv, db, execFileSync: cp.execFileSync });
  const arquivo = require('dotenv').parse(fs.readFileSync('.env', 'utf8'));
  const processo = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'backend-solicitacoes').pm2_env;
  require('./scripts/verificarReenvioAutorizacaoProducao').conferirPushPersistido({ arquivo, processo, runtimeEnv: process.env });
  const state = await require('./src/database/runMigrations').getMigrationState();
  const permitidas = ['202610230001_medicao_rejeicao_favorecido_titulo.js', '202610230002_medicao_vinculos_ativos.js'];
  if (!state.tableExists || state.pending.some(nome => !permitidas.includes(nome))) throw Error('SCHEMA_FORA_DO_PACOTE');
})().catch(() => { console.error('PREFLIGHT PROD INTERROMPIDO. Confira ambiente/schema/flags sem compartilhar segredos.'); process.exitCode = 1; })
  .finally(() => db.close());
NODE
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
timeout 120s node scripts/validarDeployMedicaoFiltrosProducao20261023.js
timeout 120s node scripts/validarMedicaoVerificadorMetadata.js
timeout 120s node scripts/validarMedicaoVinculoSchema.js
for teste in validarMedicaoRejeicaoFavorecido.js validarMedicaoValorPagamento.js validarMedicaoRecargaFluxoPagamento.js \
  validarContratoSaldoReprogramacao.js validarMedicaoFavorecidos.js validarContratoMedicaoEncerramento.js \
  validarFilaFiltrosPesquisa.js validarFilaFiltrosDp.js validarFilaPaginacao.js validarSolicitacaoDistribuicaoGerencial.js \
  validarFilaDestinatarios.js validarTituloDadosPagamento.js validarSegurancaAcessoDireto.js; do
  timeout 120s node "scripts/$teste"
done
timeout 60s node scripts/aplicarMigrationsMedicaoFiltrosProducao20261023.js --verificar
# Somente001/002 pendentes; ja registradas nunca sao reaplicadas.
timeout 300s node scripts/aplicarMigrationsMedicaoFiltrosProducao20261023.js --aplicar
timeout 60s node scripts/aplicarMigrationsMedicaoFiltrosProducao20261023.js --concluido
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
systemctl is-active --quiet fluxy-prod-db-backup.timer
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u CONFIRM_PROD_MAINTENANCE -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 60s node scripts/aplicarMigrationsMedicaoFiltrosProducao20261023.js --concluido
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada: filtros/distribuicao/medicoes/favorecido, historico preservado. Sem operacao financeira no deploy; DEV nao reiniciado.'
