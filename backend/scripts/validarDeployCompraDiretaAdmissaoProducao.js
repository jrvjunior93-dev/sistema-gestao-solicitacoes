'use strict';
// Executa os blocos reais do deploy com processo/schema/health em memoria.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-prod-compra-direta-admissao-20261015.sh'), 'utf8');
const blocks = [...source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
assert(source.includes('pm2 restart backend-solicitacoes --update-env'));
assert(!source.includes('pm2 restart backend-dev'));
assert(!/\brunMigrations\s*\(|npm run migrate|ALLOW_SCHEMA_MIGRATIONS/.test(source));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
assert(source.includes('test -z "$(git status --porcelain --untracked-files=no)"'));
async function testar(modify = () => {}) {
  let consultas = 0, schema = 0;
  const env = { deploymentEnvironment: 'production', port: 8000,
    dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: {
    pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: '8000',
    DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true', PAYMENT_OWNER_APPROVAL_MODE: 'OFF' } }];
  const database = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const fakeProcess = { env: {}, exitCode: 0 }, state = { pendente: false };
  modify({ env, processos, database, fakeProcess, state });
  let finish; const done = new Promise(resolve => { finish = resolve; });
  vm.runInNewContext(blocks[0], { process: fakeProcess, console: { log() {}, error() {} }, require(name) {
    if (name === 'node:path') return path.posix;
    if (name === 'node:child_process') return { execFileSync: (cmd, args) => {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(processos);
    } };
    if (name === './src/config/env') return { env, validateRequiredEnv() {} };
    if (name === './src/database') return { query: async sql => {
      assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); consultas++; return [[database]];
    }, close: async () => finish() };
    if (name === './src/database/runMigrations') return { assertMigrationsUpToDate: async () => {
      if (state.pendente) throw Error('Migration pendente'); schema++;
    } };
    throw new Error(`Dependencia nao simulada: ${name}`);
  } });
  await done;
  assert.deepEqual(fakeProcess.env, {}, 'Nao sobrescreve flags nem credenciais');
  return { consultas, schema, exitCode: fakeProcess.exitCode };
}
(async () => {
  const sucesso = { consultas: 1, schema: 1, exitCode: 0 };
  assert.deepEqual(await testar(), sucesso);
  assert.deepEqual(await testar(({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = '0'; processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'yes'; }), sucesso);
  assert.deepEqual(await testar(({ env, processos }) => { env.productionUserSwitchEnabled = false; processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; }), sucesso);
  assert.deepEqual(await testar(({ env, processos }) => { env.productionUserSwitchEnabled = false; delete processos[0].pm2_env.DEV_USER_SWITCH_ENABLED; delete processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED; }), sucesso);
  for (const modify of [
    ({ env }) => { env.deploymentEnvironment = 'development'; },
    ({ env }) => { env.devUserSwitchEnabled = true; },
    ({ env }) => { env.port = 8001; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push({ ...processos[0] }); },
    ({ processos }) => { processos[0].name = 'backend-dev'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8001'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ env }) => { env.productionUserSwitchEnabled = false; },
    ({ env }) => { env.paymentOwnerApprovalMode = 'ENFORCED'; }
  ]) assert.deepEqual(await testar(modify), { consultas: 0, schema: 0, exitCode: 1 });
  for (const modify of [
    ({ env }) => { env.dbHost = 'staging.invalid'; },
    ({ database }) => { database.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ database }) => { database.banco = 'outro'; },
    ({ state }) => { state.pendente = true; }
  ]) assert.deepEqual(await testar(modify), { consultas: 1, schema: 0, exitCode: 1 });
  let health = false;
  await vm.runInNewContext(blocks[1], { process: { exitCode: 0 }, AbortSignal,
    console: { log() {}, error(e) { throw Error(e); } }, fetch: async url => {
      assert.equal(url, 'http://127.0.0.1:8000/health'); health = true; return { ok: true };
    } });
  assert(health);
  console.log('Deploy PRODUCAO Compra Direta/admissao: PM2 exclusivo, identidade/porta/schema, flags efetivas preservadas, defaults equivalentes e negativas aprovados. Sem EC2/banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
