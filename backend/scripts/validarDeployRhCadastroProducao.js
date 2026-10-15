'use strict';
// Script real de producao em VM; PM2/config/schema/health simulados. Sem EC2/rede.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-prod-rh-cadastro-20261015.sh'), 'utf8');
const blocks = Array.from(source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g), m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
assert(source.includes('pm2 restart backend-solicitacoes --update-env'));
assert(!source.includes('pm2 restart backend-dev'));
assert(!/\brunMigrations\s*\(/.test(source) && !source.includes('ALLOW_SCHEMA_MIGRATIONS'));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
async function testar(modify = () => {}) {
  let verified = 0;
  const env = { deploymentEnvironment: 'production', port: 8000, dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'OFF' };
  const processo = { name: 'backend-solicitacoes', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: '8000',
    DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true', PAYMENT_OWNER_APPROVAL_MODE: 'OFF' } };
  const database = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const fakeProcess = { env: {}, exitCode: 0 }; const state = { pending: false };
  modify({ env, processo, database, fakeProcess, state });
  let finish; const done = new Promise(r => { finish = r; });
  const sandbox = { process: fakeProcess, console: { log() {}, error() {} }, require(k) {
    if (k === 'node:path') return path.posix;
    if (k === 'node:child_process') return { execFileSync: () => JSON.stringify([processo]) };
    if (k === './src/config/env') return { env, validateRequiredEnv() {} };
    if (k === './src/database') return { query: async () => [[database]], close: async () => finish() };
    if (k === './src/database/runMigrations') return { assertMigrationsUpToDate: async () => {
      if (state.pending) throw Error('Migration pendente'); verified++;
    } };
    throw new Error(k);
  } };
  vm.runInNewContext(blocks[0], sandbox); await done;
  assert.deepEqual(fakeProcess.env, {}, 'Nao altera flags de ambiente nem habilita migrations');
  return { verified, exitCode: fakeProcess.exitCode };
}
(async () => {
  const sucesso = { verified: 1, exitCode: 0 };
  assert.deepEqual(await testar(), sucesso);
  assert.deepEqual(await testar(({ processo }) => { processo.pm2_env.DEV_USER_SWITCH_ENABLED = '0'; processo.pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'yes'; }), sucesso);
  assert.deepEqual(await testar(({ env, processo }) => { env.productionUserSwitchEnabled = false; processo.pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; }), sucesso);
  for (const modify of [
    ({ env }) => { env.deploymentEnvironment = 'development'; },
    ({ env }) => { env.dbHost = 'staging.invalid'; },
    ({ env }) => { env.port = 8001; },
    ({ database }) => { database.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ database }) => { database.banco = 'outro'; },
    ({ processo }) => { processo.name = 'backend-dev'; },
    ({ processo }) => { processo.pm2_env.PORT = '8001'; },
    ({ processo }) => { processo.pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'; },
    ({ processo }) => { processo.pm2_env.DB_NAME = 'outro'; },
    ({ env }) => { env.productionUserSwitchEnabled = false; },
    ({ processo }) => { processo.pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ env }) => { env.paymentOwnerApprovalMode = 'ENFORCED'; },
    ({ state }) => { state.pending = true; }
  ]) assert.deepEqual(await testar(modify), { verified: 0, exitCode: 1 });
  let health = false;
  await vm.runInNewContext(blocks[1], { process: { exitCode: 0 }, AbortSignal,
    console: { log() {}, error(e) { throw Error(e); } }, fetch: async url => {
      assert.equal(url, 'http://127.0.0.1:8000/health'); health = true; return { ok: true };
    } });
  assert(health);
  console.log('Deploy PRODUCAO RH: identidade/PM2/porta/schema, flags efetivas preservadas, defaults equivalentes, negativas e health 8000 aprovados. Sem EC2/banco real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
