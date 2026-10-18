#!/usr/bin/env bash
# Operador: somente EC2 PRODUCAO. Nao copia .env nem muda flags/permissoes.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor b3a602fe HEAD
git merge-base --is-ancestor 8cb03a02 HEAD

cd backend
npm ci --omit=dev
node --check src/routes.js
node scripts/validarTreinamentoEdicaoVideo.js
node scripts/validarTreinamentoRastreio.js
node scripts/validarRhPagamentoSolicitacao.js
node scripts/validarRhPessoalFluxo.js --transferencias

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { getMigrationState, runMigrations, assertMigrationsUpToDate } = require('./src/database/runMigrations');
const nova = '202610140003_treinamento_video_rastreio.js';
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'production') throw new Error('DEPLOYMENT_ENV nao indica producao. Pare e confira o .env de producao.');
  const lista = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const processo = lista.find(p => p.name === 'backend-solicitacoes');
  const raiz = '/home/ubuntu/sistema-gestao-solicitacoes-main';
  if (!processo || !path.resolve(processo.pm2_env?.pm_exec_path || '').startsWith(raiz + '/backend/')) {
    throw new Error('backend-solicitacoes nao aponta para o backend do checkout main.');
  }
  const pmEnv = processo.pm2_env;
  const porta = Number(pmEnv.PORT || env.port);
  if (porta !== 8000 || env.port !== 8000) throw new Error('Porta de producao diferente de 8000.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV', 'DEV_USER_SWITCH_ENABLED', 'PRODUCTION_USER_SWITCH_ENABLED', 'PAYMENT_OWNER_APPROVAL_MODE']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(process.env[key] ?? '')) {
      throw new Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
    }
  }
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53'
    || rows[0]?.banco !== 'gestao_solicitacoes'
    || env.dbHost !== 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com') {
    throw new Error('Identidade do banco de PRODUCAO diferente da esperada. Nenhuma migration autorizada neste banco.');
  }
  console.log('Banco de producao e processo backend-solicitacoes conferidos.');
  const state = await getMigrationState();
  if (!state.tableExists) throw new Error('Ledger de migrations ausente. Pare e confira o ambiente.');
  if (state.pending.some(name => name !== nova)) {
    throw new Error(`Ha migrations nao incluidas nesta autorizacao: ${state.pending.filter(name => name !== nova).join(', ')}`);
  }
  console.log('Migrations autorizadas pendentes:', state.pending.length ? state.pending.join(', ') : 'nenhuma');
  // Flag apenas neste processo Node; nao e exportada ao PM2 nem salva no .env.
  process.env.ALLOW_SCHEMA_MIGRATIONS = 'true';
  await runMigrations({ authorized: true });
  await assertMigrationsUpToDate();
  console.log('Schema conferido. Sem seeds/backfills ou registros de negocio alterados.');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
NODE

pm2 restart backend-solicitacoes --update-env

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const response = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('PRODUCAO atualizada: backend-solicitacoes saudavel na porta 8000.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Health de producao nao respondeu. Consulte pm2 logs backend-solicitacoes --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nProducao atualizada. Nenhum processo de desenvolvimento foi reiniciado.\n'
