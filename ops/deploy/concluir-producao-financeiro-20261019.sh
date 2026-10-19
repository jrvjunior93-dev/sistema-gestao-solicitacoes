#!/usr/bin/env bash
set -euo pipefail
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer
env_hash_prod="$(sha256sum backend/.env)"

# Bootstrap disponivel em a67: somente guardas, sem exigir schema concluido.
# Antes do merge, impedir auto-restart por watch ou processo de outro checkout.
cd backend
timeout 20s node <<'NODE'
const fs = require('node:fs'), cp = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
validateRequiredEnv();
const backend = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
if (fs.realpathSync(process.cwd()) !== backend || env.deploymentEnvironment !== 'production'
  || Number(env.port) !== 8000 || env.dbName !== 'gestao_solicitacoes'
  || env.dbHost !== 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com') throw Error('AMBIENTE_PRODUCAO_DIFERENTE');
const processos = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
const p = processos[0]?.pm2_env;
if (processos.length !== 1 || p?.pm_exec_path !== `${backend}/server.js`
  || (p.PORT !== undefined && Number(p.PORT) !== 8000)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 PRODUCAO/porta/watch diverge');
console.log('Bootstrap somente leitura: producao, porta 8000, caminho PM2 e watch conferidos.');
NODE
cd ..
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor a67e3de9ff381957652d083bcbf6da6e9e62841e HEAD
git merge-base --is-ancestor a67e3de9ff381957652d083bcbf6da6e9e62841e "$versao_prod"
# Esta retomada aceita apenas correcao operacional; nao atualiza runtime/migrations.
git diff --quiet a67e3de9ff381957652d083bcbf6da6e9e62841e "$versao_prod" -- \
  . ':!backend/scripts/**' ':!ops/deploy/**' ':!docs/**'
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
# Dependencias foram instaladas no deploy a67; o lockfile nao muda nesta retomada.
node scripts/validarDeployProducao20261018.js
node scripts/validarPreflightFinanceiroProducao20261019.js
node scripts/validarRetomadaCartaoProducao.js
node scripts/validarDeployFinanceiroProducao20261019.js
npm run test:cartao-parcelamento-baixa
timeout 45s node scripts/aplicarMigrationCartaoParcelamentoProducao.js --verificar
timeout 180s node scripts/aplicarMigrationCartaoParcelamentoProducao.js --aplicar
timeout 45s node scripts/aplicarMigrationCartaoParcelamentoProducao.js --concluido
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 45s node scripts/aplicarMigrationCartaoParcelamentoProducao.js --concluido
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'Retomada concluida: migration 202610190001 conferida, health 200. Nenhuma regularizacao financeira. .env/PILOT/TLS/12h preservados; DEV nao alterado.'
