#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
test "${2:-}" = --backup-dev-conferido || { echo 'Confira o backup DEV antes de autorizar a migration.' >&2; exit 1; }
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-dev-deploy.lock)"
flock -n 9
cd backend
# Identidade, processo sem watch, schema anterior, sessao e flags antes do merge.
timeout 45s node <<'NODE'
const fs = require('node:fs'), cp = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const cwd = fs.realpathSync(process.cwd());
require('./scripts/verificarPermutasMySqlDev').conferirAmbiente({ modo: '--verificar', cwd,
  env, runtimeEnv: process.env, processos: JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })) });
const db = require('./src/database'), schema = require('./src/database/runMigrations');
require('./scripts/configurarSessao12hDev').executar({ modo: '--verificar', cwd,
  env, runtimeEnv: process.env, validateRequiredEnv, db, execFileSync: cp.execFileSync,
  schema: { assertMigrationsUpToDate: async () => {
    const state = await schema.getMigrationState();
    if (!state.tableExists || state.pending.some(n => n !== '202610190001_cartao_parcelamento_baixa.js')) {
      throw Error('Pendencias fora do pacote. Nada atualizado: ' + state.pending.join(', '));
    }
  } }
}).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
NODE
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor HEAD "$versao_dev"
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
cd backend
npm ci --omit=dev
node scripts/validarDeployCartaoParcelamentoDev.js
npm run test:cartao-parcelamento-baixa
npm run test:fila-multiplas-fontes
node scripts/validarFilaInstrumentos.js
node scripts/validarFilaPrevisaoCartao.js
node scripts/validarTituloDesvincularFatura.js
node scripts/validarCartaoOpcionalSolicitacao.js
node scripts/validarPermissoesFinanceiroRota.js
node ../frontend/scripts/validarJanelaFila.mjs
# Aplica SOMENTE a migration nova; outras pendencias interrompem antes do DDL.
# Nao configura ALLOW_SCHEMA_MIGRATIONS no .env nem no PM2.
node scripts/aplicarMigrationCartaoParcelamentoDev.js --backup-dev-conferido
timeout 45s node scripts/configurarSessao12hDev.js --verificar
timeout 120s node scripts/verificarCartaoParcelamentoMySqlDev.js --verificar
# Preserva o ambiente efetivo do PM2, PILOT e demais flags; somente backend-dev.
pm2 restart backend-dev
timeout 45s node scripts/configurarSessao12hDev.js --verificar
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
git log -1 --oneline
echo 'DEV atualizado: parcelamento na baixa. Homologar com titulos de teste; nenhuma operacao financeira automatica executada.'
