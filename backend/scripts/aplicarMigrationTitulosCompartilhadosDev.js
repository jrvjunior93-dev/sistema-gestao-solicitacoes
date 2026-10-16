'use strict';
const path = require('node:path');
const MIGRATION = '202610160001_titulos_compartilhados.js';

async function aplicar({ env, validateRequiredEnv, db, schema, execFileSync, runtimeEnv = process.env, log = console.log }) {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') {
    throw Error('AMBIENTE_DEV_DIFERENTE. Nenhuma migration aplicada.');
  }
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const pmEnv = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(pmEnv?.pm_exec_path || '') !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'
    || Number(pmEnv.PORT || env.port) !== 8001) throw Error('PROCESSO_DEV_DIFERENTE. Nenhuma migration aplicada.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
  }
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (pmEnv[key] !== undefined && ['1', 'true', 'yes', 'on'].includes(String(pmEnv[key]).trim().toLowerCase()) !== carregado) throw Error(`Flag ${key} diverge entre PM2 e configuracao carregada.`);
  }
  if (pmEnv.PAYMENT_OWNER_APPROVAL_MODE !== undefined
    && String(pmEnv.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('PAYMENT_OWNER_APPROVAL_MODE divergente. Nenhuma flag alterada.');
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE. Nenhuma migration aplicada.');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => nome !== MIGRATION)) {
    throw Error('Schema DEV tem pendencias fora deste ajuste. Pare e envie a lista: ' + state.pending.join(', '));
  }
  if (state.pending.includes(MIGRATION)) {
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  } else log('Migration de titulos compartilhados ja aplicada. Nenhuma repetida.');
  await schema.assertMigrationsUpToDate();
  log('DEV conferido: identidade, processo, porta 8001, flags e schema. Somente migration 202610160001 autorizada.');
}

if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  aplicar({ env, validateRequiredEnv, db, schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { aplicar, MIGRATION };
