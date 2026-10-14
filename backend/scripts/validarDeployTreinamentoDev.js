'use strict';
// Blocos Node reais do deploy, ambiente/PM2/banco simulados. Nenhuma EC2.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-treinamento-20261014.sh'), 'utf8');
const blocks = Array.from(source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g), m => m[1]);
assert.equal(blocks.length, 2);
blocks.forEach(b => new vm.Script(b));
assert(source.includes('pm2 restart backend-dev --update-env'));
assert(!source.includes('pm2 restart backend-solicitacoes'));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
assert(!source.includes('export ALLOW_SCHEMA_MIGRATIONS'));
async function testar(modify = () => {}) {
  let applied = 0, verified = 0;
  const env = { deploymentEnvironment: 'development', port: 8100, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' };
  const processo = { name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: '8100' } };
  const database = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: ['202610140003_treinamento_video_rastreio.js'] };
  const fakeProcess = { env: {}, exitCode: 0 };
  modify({ env, processo, database, state, fakeProcess });
  let finish; const done = new Promise(r => { finish = r; });
  const sandbox = { process: fakeProcess, console: { log() {}, error() {} }, require(k) {
    if (k === 'node:path') return path.posix;
    if (k === 'node:child_process') return { execFileSync: () => JSON.stringify([processo]) };
    if (k === './src/config/env') return { env, validateRequiredEnv() {} };
    if (k === './src/database') return { query: async () => [[database]], close: async () => finish() };
    if (k === './src/database/runMigrations') return {
      getMigrationState: async () => state,
      runMigrations: async options => { assert(options.authorized); assert.equal(fakeProcess.env.ALLOW_SCHEMA_MIGRATIONS, 'true'); applied++; },
      assertMigrationsUpToDate: async () => { verified++; }
    };
    throw new Error(k);
  } };
  vm.runInNewContext(blocks[0], sandbox); await done;
  return { applied, verified, exitCode: fakeProcess.exitCode };
}
(async () => {
  assert.deepEqual(await testar(), { applied: 1, verified: 1, exitCode: 0 });
  assert.deepEqual(await testar(({ state }) => { state.pending = []; }), { applied: 1, verified: 1, exitCode: 0 });
  for (const modify of [
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.dbHost = 'producao.invalid'; },
    ({ database }) => { database.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ database }) => { database.banco = 'outro'; },
    ({ processo }) => { processo.pm2_env.PORT = '8000'; },
    ({ processo }) => { processo.pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processo }) => { processo.pm2_env.DB_NAME = 'outro'; },
    ({ state }) => { state.tableExists = false; },
    ({ state }) => { state.pending.push('nao_autorizada.js'); }
  ]) assert.deepEqual(await testar(modify), { applied: 0, verified: 0, exitCode: 1 });
  console.log('Deploy DEV Treinamento: sintaxe Node, PM2/porta/env, UUID/banco/endpoint, migration unica, retry e negativas aprovadas. Sem banco/EC2.');
})().catch(e => { console.error(e); process.exitCode = 1; });
