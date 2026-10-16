'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { aplicar, MIGRATION } = require('./aplicarMigrationContratoMedicaoDev');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-contratos-medicao-20261016.sh'), 'utf8');
for (const texto of ['flock -n 9', 'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"', 'pm2 restart backend-dev --update-env', 'npm run test:contrato-medicao-marcacao', 'npm run test:performance-fila-dp']) assert(source.includes(texto));
assert(!source.includes('pm2 restart backend-solicitacoes'));
assert(source.indexOf('node scripts/aplicarMigrationContratoMedicaoDev.js') < source.indexOf('pm2 restart'));
async function testar(alterar = () => {}) {
  const env = { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', devUserSwitchEnabled: true, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: '8001' } }];
  const banco = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: [MIGRATION], failMigration: false }, runtimeEnv = {};
  let queries = 0, migrations = 0, schema = 0, erro = null;
  alterar({ env, processos, banco, state, runtimeEnv });
  const anterior = { ...runtimeEnv };
  try {
    await aplicar({ env, runtimeEnv, validateRequiredEnv() {}, log() {},
      execFileSync(cmd, args) { assert.equal(cmd, 'pm2'); assert.deepEqual(args, ['jlist']); return JSON.stringify(processos); },
      db: { query: async sql => { assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); queries++; return [[banco]]; } },
      schema: { getMigrationState: async () => state,
        runMigrations: async options => { assert.equal(options.authorized, true); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true'); migrations++; if (state.failMigration) throw Error('DDL falhou'); state.pending = []; },
        assertMigrationsUpToDate: async () => { schema++; assert.equal(state.pending.length, 0); } }
    });
  } catch (e) { erro = e; }
  assert.deepEqual(runtimeEnv, anterior, 'Nao persiste flags nem altera configuracao');
  return { queries, migrations, schema, erro };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.migrations, 1); assert.equal(r.schema, 1);
  r = await testar(({ state }) => { state.pending = []; }); assert.equal(r.migrations, 0); assert.equal(r.schema, 1);
  for (const alterar of [
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.port = 8000; },
    ({ env }) => { env.dbHost = 'producao.example'; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-fixture'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.migrations, 0); assert(!r.erro.message.includes('segredo-fixture')); }
  for (const alterar of [
    ({ banco }) => { banco.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ state }) => { state.pending.push('migration-nao-autorizada.js'); },
    ({ state }) => { state.tableExists = false; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.migrations, 0); assert.equal(r.schema, 0); }
  r = await testar(({ state }) => { state.failMigration = true; }); assert(r.erro); assert.equal(r.schema, 0);
  r = await testar(({ runtimeEnv }) => { runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'false'; }); assert.equal(r.erro, null);
  const blocoHealth = /node <<'NODE'\r?\n([^]*?)\r?\nNODE/.exec(source)[1];
  for (const ok of [true, false]) {
    const proc = { exitCode: 0 }; let tentativas = 0;
    await vm.runInNewContext(blocoHealth, { process: proc, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() {} },
      fetch: async url => { tentativas++; assert.equal(url, 'http://127.0.0.1:8001/health'); return { ok }; } });
    assert.equal(proc.exitCode, ok ? 0 : 1); assert.equal(tentativas, ok ? 1 : 20);
  }
  console.log('Deploy contrato totalmente medido DEV: identidade/PM2/porta/flags, whitelist de migration, retomada, negativa de producao/pendencias e health aprovados. Sem banco/EC2/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
