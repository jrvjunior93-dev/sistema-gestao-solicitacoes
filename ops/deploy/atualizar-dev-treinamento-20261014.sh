#!/usr/bin/env bash
# Operador: somente EC2 DEV. Nao copia .env, nao aplica seeds/backfills.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 51b96744 HEAD

cd backend
npm ci --omit=dev
node --check src/routes.js
node scripts/validarTreinamentoEdicaoVideo.js
node scripts/validarTreinamentoRastreio.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { getMigrationState, runMigrations, assertMigrationsUpToDate } = require('./src/database/runMigrations');
const nova = '202610140003_treinamento_video_rastreio.js';
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment === 'production') throw new Error('DEPLOYMENT_ENV indica producao. Pare e confira o .env de dev.');
  const lista = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const processo = lista.find(p => p.name === 'backend-dev');
  const raiz = '/home/ubuntu/sistema-gestao-solicitacoes-dev';
  if (!processo || !path.resolve(processo.pm2_env?.pm_exec_path || '').startsWith(raiz + '/backend/')) {
    throw new Error('backend-dev nao aponta para o backend do checkout dev.');
  }
  const pmEnv = processo.pm2_env;
  const porta = Number(pmEnv.PORT || env.port);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535 || porta === 8000) throw new Error('Porta de dev invalida ou igual a producao.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(process.env[key] ?? '')) {
      throw new Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
    }
  }
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d'
    || rows[0]?.banco !== 'gestao_solicitacoes'
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') {
    throw new Error('Identidade do banco DEV diferente da esperada. Nenhuma migration autorizada neste banco.');
  }
  console.log('Banco staging e processo backend-dev conferidos.');
  const state = await getMigrationState();
  if (!state.tableExists) throw new Error('Ledger de migrations ausente. Pare e confira o ambiente.');
  if (state.pending.some(name => name !== nova)) {
    throw new Error(`Ha migrations nao incluidas nesta autorizacao: ${state.pending.filter(name => name !== nova).join(', ')}`);
  }
  console.log('Migrations autorizadas pendentes:', state.pending.length ? state.pending.join(', ') : 'nenhuma');
  // Flag restrita a este processo Node, nunca exportada ao PM2 ou gravada no .env.
  process.env.ALLOW_SCHEMA_MIGRATIONS = 'true';
  await runMigrations({ authorized: true });
  await assertMigrationsUpToDate();
  console.log('Schema de treinamento conferido; sem seeds/backfills ou registros de negocio alterados.');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
NODE

pm2 restart backend-dev --update-env

node <<'NODE'
const { execFileSync } = require('node:child_process');
const { env } = require('./src/config/env');
(async () => {
  const processo = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'backend-dev');
  const porta = Number(processo?.pm2_env?.PORT || env.port);
  if (!Number.isInteger(porta) || porta <= 0 || porta === 8000) throw new Error('Porta de dev invalida.');
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const response = await fetch(`http://127.0.0.1:${porta}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log(`DEV atualizado: backend-dev saudavel na porta ${porta}.`); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Health do backend-dev nao respondeu. Consulte pm2 logs backend-dev --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nSomente DEV atualizado. Nenhum processo de producao foi reiniciado.\n'
