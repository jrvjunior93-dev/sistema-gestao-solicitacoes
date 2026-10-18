'use strict';
// Nao importa config/env ou database. Exercita o runner com todas as E/S simuladas.
const assert = require('node:assert/strict');
const { executar, MIGRATION, BACKEND, IDENTIDADE_SQL, JSON_SQL, COLUNA_SQL } = require('./aplicarMigrationPwaSaldoDev');
async function testar(alterar = () => {}) {
  const args = { modo: '--aplicar', cwd: BACKEND, env: { deploymentEnvironment: 'development', port: 8001,
    dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', devUserSwitchEnabled: true,
    productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'PILOT' }, runtimeEnv: { CONFIRM_DEV_BACKUP: 'SIM' } };
  const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: '8001', PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', watch: false } }];
  const identidade = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: [MIGRATION], falha: false, json: 7, coluna: [{ tipo: 'json', anulavel: 'YES' }] };
  alterar({ args, processos, identidade, state });
  const anterior = { ...args.runtimeEnv }, pmAnterior = JSON.stringify(processos);
  let queries = 0, migrations = 0, schema = 0, erro = null;
  try {
    await executar({ ...args, validateRequiredEnv() {}, log() {},
      execFileSync(cmd, params) { assert.equal(cmd, 'pm2'); assert.deepEqual(params, ['jlist']); return JSON.stringify(processos); },
      db: { query: async sql => {
        queries++;
        if (sql === IDENTIDADE_SQL) return [[identidade]];
        if (sql === JSON_SQL) return [[{ item_ok: state.json }]];
        if (sql === COLUNA_SQL) return [state.coluna];
        throw Error('Query inesperada');
      } },
      schema: { getMigrationState: async () => state,
        runMigrations: async o => {
          assert.equal(o.authorized, true); assert.equal(args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
          assert.deepEqual(state.pending, [MIGRATION]); migrations++;
          if (state.falha) throw Error('DDL falhou'); state.pending = [];
        },
        assertMigrationsUpToDate: async () => { assert.equal(state.pending.length, 0); schema++; }
      }
    });
  } catch (e) { erro = e; }
  assert.deepEqual(args.runtimeEnv, anterior); assert.equal(JSON.stringify(processos), pmAnterior);
  assert(!erro?.message.includes('segredo-fixture'));
  return { queries, migrations, schema, erro };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.migrations, 1); assert.equal(r.schema, 1);
  r = await testar(({ args }) => { args.modo = '--verificar'; delete args.runtimeEnv.CONFIRM_DEV_BACKUP; });
  assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 0); assert.equal(r.queries, 2);
  r = await testar(({ state }) => { state.pending = []; }); assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 1);
  r = await testar(({ state, args }) => { state.pending = []; args.modo = '--verificar'; }); assert.equal(r.erro, null); assert.equal(r.migrations, 0);
  for (const alterar of [
    ({ args }) => { args.modo = '--outro'; },
    ({ args }) => { args.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend'; },
    ({ args }) => { args.env.deploymentEnvironment = 'production'; },
    ({ args }) => { args.env.port = 8000; },
    ({ args }) => { args.env.dbHost = 'outro'; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.watch = true; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-fixture'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ processos }) => { processos[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    ({ args }) => { args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.migrations, 0); }
  for (const alterar of [
    ({ identidade }) => { identidade.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ identidade }) => { identidade.banco = 'outro'; },
    ({ state }) => { state.pending.push('migration-nao-autorizada.js'); },
    ({ state }) => { state.tableExists = false; },
    ({ state }) => { state.json = 0; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_DEV_BACKUP; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.migrations, 0); assert.equal(r.schema, 0); }
  r = await testar(({ state }) => { state.falha = true; }); assert(r.erro); assert.equal(r.schema, 0);
  r = await testar(({ state }) => { state.coluna = []; }); assert(r.erro); assert.equal(r.migrations, 1);
  const fs = require('node:fs'), path = require('node:path');
  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-pwa-saldo-20261018.sh'), 'utf8');
  assert.match(shell, /pm2 restart backend-dev --update-env/);
  assert(!/pm2\s+(?:restart|reload|delete|stop)\s+(?:all|backend-solicitacoes)/.test(shell));
  assert.match(shell, /git merge --ff-only/); assert.match(shell, /CONFIRM_DEV_BACKUP/);
  console.log('Deploy PWA DEV: caminho/host/UUID/PM2/porta/watch/flags, backup, whitelist unica, retomada, falhas, JSON somente leitura e coluna JSON validados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
