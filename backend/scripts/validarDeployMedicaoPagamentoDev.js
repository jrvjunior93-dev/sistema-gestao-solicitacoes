'use strict';
const assert = require('node:assert/strict');
const { executar, MIGRATION, BACKEND } = require('./aplicarMigrationMedicaoPagamentoDev');
async function testar(alterar = () => {}) {
  const args = { modo: '--aplicar', cwd: BACKEND, env: { deploymentEnvironment: 'development', port: 8001,
    dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', devUserSwitchEnabled: true,
    productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' }, runtimeEnv: { CONFIRM_DEV_BACKUP: 'SIM' } };
  const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: '8001' } }];
  const banco = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: [MIGRATION], falha: false };
  let queries = 0, migrations = 0, schema = 0, erro = null;
  alterar({ args, processos, banco, state }); const anterior = { ...args.runtimeEnv };
  try {
    await executar({ ...args, validateRequiredEnv() {}, log() {},
      execFileSync(cmd, params) { assert.equal(cmd, 'pm2'); assert.deepEqual(params, ['jlist']); return JSON.stringify(processos); },
      db: { query: async sql => { assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); queries++; return [[banco]]; } },
      schema: { getMigrationState: async () => state,
        runMigrations: async options => { assert.equal(options.authorized, true); assert.equal(args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true'); migrations++;
          if (state.falha) throw Error('DDL falhou'); state.pending = []; },
        assertMigrationsUpToDate: async () => { assert.equal(state.pending.length, 0); schema++; } }
    });
  } catch (e) { erro = e; }
  assert.deepEqual(args.runtimeEnv, anterior, 'Nao persiste flags nem altera configuracao');
  return { queries, migrations, schema, erro };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.migrations, 1); assert.equal(r.schema, 1);
  r = await testar(({ args }) => { args.modo = '--verificar'; delete args.runtimeEnv.CONFIRM_DEV_BACKUP; }); assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 0);
  r = await testar(({ state }) => { state.pending = []; }); assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 1);
  for (const alterar of [
    ({ args }) => { args.modo = '--outro'; },
    ({ args }) => { args.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend'; },
    ({ args }) => { args.env.deploymentEnvironment = 'production'; },
    ({ args }) => { args.env.port = 8000; },
    ({ args }) => { args.env.dbHost = 'producao'; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-fixture'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.migrations, 0); assert(!r.erro.message.includes('segredo-fixture')); }
  for (const alterar of [
    ({ banco }) => { banco.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ state }) => { state.pending.push('migration-nao-autorizada.js'); },
    ({ state }) => { state.tableExists = false; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_DEV_BACKUP; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.migrations, 0); assert.equal(r.schema, 0); }
  r = await testar(({ state }) => { state.falha = true; }); assert(r.erro); assert.equal(r.schema, 0);
  r = await testar(({ args }) => { args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'false'; }); assert.equal(r.erro, null);
  console.log('Deploy DEV medicao: preflight somente leitura, identidade/PM2/porta/flags, backup explicito, whitelist unica, retomada e falha fechada aprovados. Sem banco/EC2/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
