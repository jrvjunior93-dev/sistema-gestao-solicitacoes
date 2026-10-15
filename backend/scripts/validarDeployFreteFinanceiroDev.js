'use strict';
// Executa blocos reais do script com PM2/banco/schema isolados. Nao le .env.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-frete-financeiro-20261015.sh'), 'utf8');
const blocks = [...source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocks.length, 2);
blocks.forEach(b => new vm.Script(b));
assert(source.includes('pm2 restart backend-dev --update-env'));
assert(!source.includes('pm2 restart backend-solicitacoes'));
assert(!/\brunMigrations\s*\(|npm run migrate|ALLOW_SCHEMA_MIGRATIONS|export .*SWITCH/.test(source));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
assert(source.includes('test -z "$(git status --porcelain --untracked-files=no)"'));
assert(source.includes('node scripts/validarCompraDiretaFreteFinanceiro.js'));
async function testar(modify = () => {}) {
  let consultas = 0, schema = 0;
  const env = { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: true, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: '8001' } }];
  const database = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const fakeProcess = { env: {}, exitCode: 0 }, state = { pendente: false, configInvalida: false };
  modify({ env, processos, database, fakeProcess, state });
  let finish; const done = new Promise(resolve => { finish = resolve; });
  vm.runInNewContext(blocks[0], { process: fakeProcess, console: { log() {}, error() {} }, require(name) {
    if (name === 'node:path') return path.posix;
    if (name === 'node:child_process') return { execFileSync: (cmd, args) => {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(processos);
    } };
    if (name === './src/config/env') return { env, validateRequiredEnv() { if (state.configInvalida) throw Error('config invalida'); } };
    if (name === './src/database') return { query: async sql => {
      assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); consultas++; return [[database]];
    }, close: async () => finish() };
    if (name === './src/database/runMigrations') return { assertMigrationsUpToDate: async () => {
      if (state.pendente) throw Error('Migration pendente'); schema++;
    } };
    throw new Error(`Dependencia nao simulada: ${name}`);
  } });
  await done;
  return { consultas, schema, exitCode: fakeProcess.exitCode };
}
(async () => {
  assert.deepEqual(await testar(), { consultas: 1, schema: 1, exitCode: 0 });
  for (const modify of [
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = '0'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; },
    ({ processos, env }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; env.productionUserSwitchEnabled = true; }
  ]) assert.deepEqual(await testar(modify), { consultas: 1, schema: 1, exitCode: 0 });
  for (const modify of [
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.port = 8000; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push({ ...processos[0] }); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ state }) => { state.configInvalida = true; }
  ]) assert.deepEqual(await testar(modify), { consultas: 0, schema: 0, exitCode: 1 });
  for (const modify of [
    ({ env }) => { env.dbHost = 'producao.invalid'; },
    ({ database }) => { database.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ database }) => { database.banco = 'outro'; },
    ({ state }) => { state.pendente = true; }
  ]) assert.deepEqual(await testar(modify), { consultas: 1, schema: 0, exitCode: 1 });
  const fakeProcess = { exitCode: 0 };
  await vm.runInNewContext(blocks[1], { process: fakeProcess, AbortSignal, console: { log() {}, error() {} },
    fetch: async url => { assert.equal(url, 'http://127.0.0.1:8001/health'); return { ok: true }; } });
  assert.equal(fakeProcess.exitCode, 0);
  let tentativas = 0;
  await vm.runInNewContext(blocks[1], { process: fakeProcess, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() {} },
    fetch: async () => { tentativas++; throw Error('health indisponivel'); } });
  assert.equal(tentativas, 20); assert.equal(fakeProcess.exitCode, 1);
  console.log('Deploy DEV frete: processo/porta 8001 exclusivos, identidade/schema, flags equivalentes sem sobrescrita e health/negativas aprovados. Sem EC2/banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
