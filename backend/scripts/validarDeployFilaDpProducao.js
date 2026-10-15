'use strict';
// Blocos reais do deploy com dependencias isoladas; sem EC2/banco/PM2/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-prod-fila-dp-20261015.sh'), 'utf8');
const blocks = [...source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
for (const text of ['flock -n 9', 'test "$(git branch --show-current)" = main',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'pm2 restart backend-solicitacoes --update-env',
  '41e154f4c665ddd5bc1da88c384203de4d5c34ef', 'da9cf5696f0cff7ef9a8d7acf2480a3e1acbb851']) assert(source.includes(text));
for (const text of ['pm2 restart backend-dev', 'ALLOW_SCHEMA_MIGRATIONS', 'runMigrations(', 'git clean']) assert(!source.includes(text));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
async function testar(alterar = () => {}) {
  let queries = 0, schema = 0, validacao = 0;
  const env = { deploymentEnvironment: 'production', port: 8000,
    dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: {
    pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: '8000',
    PRODUCTION_USER_SWITCH_ENABLED: 'true', PAYMENT_OWNER_APPROVAL_MODE: 'OFF' } }];
  const banco = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const state = { falhaConfig: false, falhaSchema: false };
  const proc = { env: {}, exitCode: 0 };
  alterar({ env, processos, banco, state, proc });
  const anterior = { ...proc.env };
  let fechar; const done = new Promise(ok => { fechar = ok; });
  vm.runInNewContext(blocks[0], { process: proc, console: { log() {}, error(message) { assert(!message.includes('segredo-teste')); } }, require(id) {
    if (id === 'node:path') return path.posix;
    if (id === 'node:child_process') return { execFileSync(cmd, args) {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(processos);
    } };
    if (id === './src/config/env') return { env, validateRequiredEnv() { validacao++; if (state.falhaConfig) throw Error('Config negada'); } };
    if (id === './src/database') return { query: async sql => {
      assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); queries++; return [[banco]];
    }, close: async () => fechar() };
    if (id === './src/database/runMigrations') return {
      assertMigrationsUpToDate: async () => { schema++; if (state.falhaSchema) throw Error('Schema pendente'); }
    };
    throw Error('Dependencia nao isolada: ' + id);
  } });
  await done;
  assert.deepEqual(proc.env, anterior, 'Nao alterar flags/configuracao');
  return { queries, schema, exitCode: proc.exitCode, validacao };
}
(async () => {
  assert.deepEqual(await testar(), { queries: 1, schema: 1, exitCode: 0, validacao: 1 });
  for (const modo of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED']) {
    assert.deepEqual(await testar(({ env, processos, proc }) => {
      env.paymentOwnerApprovalMode = modo;
      processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = modo;
      proc.env.PAYMENT_OWNER_APPROVAL_MODE = modo;
    }), { queries: 1, schema: 1, exitCode: 0, validacao: 1 });
    // Qualquer mudanca entre o processo atual e a configuracao bloqueia antes do banco.
    for (const destino of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED'].filter(m => m !== modo)) {
      assert.deepEqual(await testar(({ env, processos, proc }) => {
        env.paymentOwnerApprovalMode = destino;
        processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = modo;
        proc.env.PAYMENT_OWNER_APPROVAL_MODE = destino;
      }), { queries: 0, schema: 0, exitCode: 1, validacao: 1 });
    }
  }
  for (const alterar of [
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = '0'; },
    ({ env, processos }) => { env.productionUserSwitchEnabled = false; processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ env, processos }) => { env.productionUserSwitchEnabled = false; delete processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED; }
  ]) assert.equal((await testar(alterar)).exitCode, 0);
  for (const alterar of [
    ({ env }) => { env.deploymentEnvironment = 'development'; },
    ({ env }) => { env.port = 8001; },
    ({ env }) => { env.devUserSwitchEnabled = true; },
    ({ env }) => { env.paymentOwnerApprovalMode = 'PILOT'; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push({ ...processos[0] }); },
    ({ processos }) => { processos[0].name = 'backend-dev'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8001'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-teste'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'INVALIDO'; },
    ({ proc }) => { proc.env.PAYMENT_OWNER_APPROVAL_MODE = 'INVALIDO'; },
    ({ env, proc, processos }) => {
      env.paymentOwnerApprovalMode = 'PILOT'; proc.env.PAYMENT_OWNER_APPROVAL_MODE = 'PILOT';
      delete processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE;
    },
    ({ state }) => { state.falhaConfig = true; }
  ]) assert.deepEqual(await testar(alterar), { queries: 0, schema: 0, exitCode: 1, validacao: 1 });
  for (const alterar of [
    ({ banco }) => { banco.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ env }) => { env.dbHost = 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'; }
  ]) assert.deepEqual(await testar(alterar), { queries: 1, schema: 0, exitCode: 1, validacao: 1 });
  assert.equal((await testar(({ state }) => { state.falhaSchema = true; })).exitCode, 1);
  let falhas = 0;
  for (const sucesso of [true, false]) {
    const proc = { exitCode: 0 }; let tentativas = 0;
    await vm.runInNewContext(blocks[1], { process: proc, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() { falhas++; } },
      fetch: async url => { tentativas++; assert.equal(url, 'http://127.0.0.1:8000/health'); return { ok: sucesso }; } });
    assert.equal(proc.exitCode, sucesso ? 0 : 1); assert.equal(tentativas, sucesso ? 1 : 20);
  }
  assert.equal(falhas, 1);
  console.log('Deploy PROD: identidade/porta/processo/schema, modo existente OFF/PILOT/ENFORCED/PAUSED preservado, transicoes/invalidos bloqueados, mutex e health aprovados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
