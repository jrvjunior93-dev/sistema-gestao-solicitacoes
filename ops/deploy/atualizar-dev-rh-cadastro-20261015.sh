#!/usr/bin/env bash
# Operador: apenas EC2 DEV. Este ajuste nao aplica migrations.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 8cb03a029592d1f16516277235200ee55ceefac0 HEAD

cd backend
npm ci --omit=dev
node --check src/services/rhPagamentoSolicitacaoService.js
node scripts/validarRhPagamentoSolicitacao.js
node scripts/validarRhPagamentoEnvioParcial.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { assertMigrationsUpToDate } = require('./src/database/runMigrations');
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment === 'production') throw new Error('Ambiente indica producao. Pare e confira.');
  const processo = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'backend-dev');
  if (!processo || !path.resolve(processo.pm2_env?.pm_exec_path || '').startsWith('/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/')) {
    throw new Error('backend-dev nao aponta para o checkout dev.');
  }
  const pmEnv = processo.pm2_env;
  if (Number(pmEnv.PORT || env.port) !== 8100 || Number(env.port) !== 8100) throw new Error('Porta de dev diferente de 8100.');
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
      const response = await fetch('http://127.0.0.1:8100/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('backend-dev saudavel na porta 8100.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Health de dev nao respondeu. Consulte pm2 logs backend-dev --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nDEV atualizado. Nenhum processo de producao reiniciado.\n'
