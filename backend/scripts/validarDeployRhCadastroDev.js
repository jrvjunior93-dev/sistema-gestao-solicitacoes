'use strict';
// Preflight real do script com PM2/config/banco em memoria. Sem EC2/banco/rede.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-rh-cadastro-20261015.sh'), 'utf8');
const blocks = Array.from(source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g), m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
assert(source.includes('pm2 restart backend-dev --update-env'));
assert(!source.includes('pm2 restart backend-solicitacoes'));
assert(!/\brunMigrations\s*\(/.test(source) && !source.includes('ALLOW_SCHEMA_MIGRATIONS'));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
async function testar(modify = () => {}) {
  let verified = 0;
  const env = { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' };
  const processo = { name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: '8001' } };
  const database = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
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
  return { verified, exitCode: fakeProcess.exitCode };
}
(async () => {
  assert.deepEqual(await testar(), { verified: 1, exitCode: 0 });
  for (const modify of [
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.dbHost = 'producao.invalid'; },
    ({ env }) => { env.port = 8000; },
    ({ env, processo }) => { env.port = 8100; processo.pm2_env.PORT = '8100'; },
    ({ database }) => { database.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ database }) => { database.banco = 'outro'; },
    ({ processo }) => { processo.name = 'backend-solicitacoes'; },
    ({ processo }) => { processo.pm2_env.PORT = '8000'; },
    ({ processo }) => { processo.pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processo }) => { processo.pm2_env.DB_NAME = 'outro'; },
    ({ processo, fakeProcess }) => { processo.pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; fakeProcess.env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ processo, fakeProcess }) => { processo.pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; fakeProcess.env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ state }) => { state.pending = true; }
  ]) assert.deepEqual(await testar(modify), { verified: 0, exitCode: 1 });
  let healthConsultado = false;
  await vm.runInNewContext(blocks[1], { process: { exitCode: 0 }, AbortSignal,
    console: { log() {}, error(e) { throw Error(e); } }, fetch: async url => {
      assert.equal(url, 'http://127.0.0.1:8001/health'); healthConsultado = true; return { ok: true };
    } });
  assert(healthConsultado, 'Health deve consultar a porta DEV real, sem rede');
  console.log('Deploy DEV RH: PM2/porta/env, banco/endpoint/UUID e schema aprovados; negativas bloqueadas. Sem migration/banco real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
