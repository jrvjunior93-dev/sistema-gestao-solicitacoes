'use strict';
// Executa os blocos reais do deploy com dependencias em memoria, sem banco/rede/PM2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-prod-pendencias-20261015.sh'), 'utf8');
const blocks = [...source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
for (const trecho of ['flock -n 9', 'test "$(git branch --show-current)" = main',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'pm2 restart backend-solicitacoes --update-env',
  '8ecde6ff73e160e245b9c128e67ac8659d3ea8e1', '10c583645037695ff3e8d8ea327497d9b24f6190']) assert(source.includes(trecho));
assert(!source.includes('pm2 restart backend-dev'));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
const permitidas = ['202610150001_cartoes_recarga_saldo.js', '202610150002_comprovante_compartilhado_fila.js'];
async function testar(alterar = () => {}) {
  let queries = 0, migrations = 0, schema = 0;
  const env = { deploymentEnvironment: 'production', port: 8000,
    dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: {
    pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: '8000',
    PRODUCTION_USER_SWITCH_ENABLED: 'true', PAYMENT_OWNER_APPROVAL_MODE: 'OFF' } }];
  const banco = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: [...permitidas] };
  const proc = { env: {}, exitCode: 0 };
  alterar({ env, processos, banco, state, proc });
  const anterior = { ...proc.env };
  let fechar; const done = new Promise(ok => { fechar = ok; });
  vm.runInNewContext(blocks[0], { process: proc, console: { log() {}, error() {} }, require(id) {
    if (id === 'node:path') return path.posix;
    if (id === 'node:child_process') return { execFileSync(cmd, args) {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(processos);
    } };
    if (id === './src/config/env') return { env, validateRequiredEnv() { if (state.falhaConfig) throw Error('Config negada'); } };
    if (id === './src/database') return { query: async sql => {
      assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); queries++; return [[banco]];
    }, close: async () => fechar() };
    if (id === './src/database/runMigrations') return {
      getMigrationState: async () => state,
      runMigrations: async options => {
        assert.equal(proc.env.ALLOW_SCHEMA_MIGRATIONS, 'true'); assert.equal(options.authorized, true);
        assert(state.pending.every(n => permitidas.includes(n))); migrations++;
        if (state.falhaMigration) throw Error('Migration falhou');
      },
      assertMigrationsUpToDate: async () => { if (state.falhaSchema) throw Error('Schema divergente'); schema++; }
    };
    throw Error('Dependencia nao isolada: ' + id);
  } });
  await done;
  assert.deepEqual(proc.env, anterior, 'Nao sobrescrever ambiente/flags nem deixar autorizacao global de migrations');
  return { queries, migrations, schema, exitCode: proc.exitCode };
}
(async () => {
  const ok = { queries: 1, migrations: 1, schema: 1, exitCode: 0 };
  assert.deepEqual(await testar(), ok);
  for (const pending of [[], [permitidas[0]], [permitidas[1]]]) {
    assert.deepEqual(await testar(({ state }) => { state.pending = pending; }), { ...ok, migrations: pending.length ? 1 : 0 });
  }
  for (const alterar of [
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'yes'; processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ env, processos }) => { env.productionUserSwitchEnabled = false; processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ env, processos }) => { env.productionUserSwitchEnabled = false; delete processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED; },
    ({ proc }) => { proc.env.ALLOW_SCHEMA_MIGRATIONS = 'false'; }
  ]) assert.deepEqual(await testar(alterar), ok);
  for (const alterar of [
    ({ env }) => { env.deploymentEnvironment = 'development'; },
    ({ env }) => { env.devUserSwitchEnabled = true; },
    ({ env }) => { env.port = 8001; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push({ ...processos[0] }); },
    ({ processos }) => { processos[0].name = 'backend-dev'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8001'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'nao-exibir'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ env }) => { env.productionUserSwitchEnabled = false; },
    ({ env }) => { env.paymentOwnerApprovalMode = 'ENFORCED'; },
    ({ state }) => { state.falhaConfig = true; }
  ]) assert.deepEqual(await testar(alterar), { queries: 0, migrations: 0, schema: 0, exitCode: 1 });
  for (const alterar of [
    ({ banco }) => { banco.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ env }) => { env.dbHost = 'staging.invalid'; },
    ({ state }) => { state.pending.push('outra.js'); },
    ({ state }) => { state.tableExists = false; }
  ]) assert.deepEqual(await testar(alterar), { queries: 1, migrations: 0, schema: 0, exitCode: 1 });
  assert.deepEqual(await testar(({ state, proc }) => { state.falhaMigration = true; proc.env.ALLOW_SCHEMA_MIGRATIONS = 'false'; }), { queries: 1, migrations: 1, schema: 0, exitCode: 1 });
  assert.equal((await testar(({ state }) => { state.falhaSchema = true; })).exitCode, 1);
  for (const sucesso of [true, false]) {
    const proc = { exitCode: 0 }; let tentativas = 0;
    await vm.runInNewContext(blocks[1], { process: proc, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() {} },
      fetch: async url => { tentativas++; assert.equal(url, 'http://127.0.0.1:8000/health'); return { ok: sucesso }; } });
    assert.equal(proc.exitCode, sucesso ? 0 : 1); assert.equal(tentativas, sucesso ? 1 : 20);
  }
  console.log('Deploy PRODUCAO: identidade, PM2 exclusivo/8000, flags preservadas, somente duas migrations, retomada/replay, falhas e health aprovados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
