#!/usr/bin/env bash
# Somente DEV. Nao aplica migrations, seeds, backfills ou configuracoes.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor b9ef16e4474833cb7f95ab285caf3708faf5a468 HEAD

cd backend
npm ci --omit=dev
node --check src/controllers/SolicitacaoCompraController.js
node --check src/controllers/RhAdmissaoCatalogoController.js
node --check src/services/compraDiretaGestaoService.js
node scripts/validarCompraDiretaGestao.js
node scripts/validarCompraDiretaGeoAcesso.js
node scripts/validarRhAdmissaoCatalogo.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { assertMigrationsUpToDate } = require('./src/database/runMigrations');
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'development') throw new Error('Ambiente diferente de development. Pare e confira.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const processo = processos[0];
  if (processos.length !== 1 || path.resolve(processo.pm2_env?.pm_exec_path || '') !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js') {
    throw new Error('backend-dev nao aponta exclusivamente para o checkout dev.');
  }
  const pmEnv = processo.pm2_env;
  if (Number(pmEnv.PORT || env.port) !== 8001 || Number(env.port) !== 8001) throw new Error('Porta de dev diferente de 8001.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV', 'DEV_USER_SWITCH_ENABLED', 'PRODUCTION_USER_SWITCH_ENABLED', 'PAYMENT_OWNER_APPROVAL_MODE']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(process.env[key] ?? '')) {
      throw new Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
    }
  }
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d'
    || rows[0]?.banco !== 'gestao_solicitacoes'
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') {
    throw new Error('Identidade do banco DEV diferente da esperada.');
  }
  await assertMigrationsUpToDate();
  console.log('DEV: processo, porta, banco e schema conferidos. Nenhuma migration aplicada.');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
NODE

pm2 restart backend-dev --update-env

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('backend-dev saudavel na porta 8001.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Health de dev nao respondeu. Consulte pm2 logs backend-dev --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nDEV atualizado. Nenhum processo de producao reiniciado.\n'
