'use strict';
// Executa os blocos reais isolados de ambiente, PM2, banco e rede externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-performance-fila-dp-20261015.sh'), 'utf8');
const blocks = [...source.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocks.length, 2); blocks.forEach(b => new vm.Script(b));
for (const text of ['flock -n 9', 'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"', 'pm2 restart backend-dev --update-env']) assert(source.includes(text));
assert(!source.includes('pm2 restart backend-solicitacoes'));
assert(!source.includes('ALLOW_SCHEMA_MIGRATIONS'));
assert(!source.includes('runMigrations('));
assert(source.indexOf('pm2 restart') > source.indexOf('await assertMigrationsUpToDate()'));
for (const test of ['validarFilaFiltrosDp', 'validarRhTitulosEnviadosRelatorio', 'validarRhPagamentoSolicitacao', 'validarRhPagamentoEnvioParcial']) assert(source.includes(`node scripts/${test}.js`));
async function testar(alterar = () => {}) {
  let queries = 0, schema = 0, validacao = 0;
  const env = { deploymentEnvironment: 'development', port: 8001,
    dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    devUserSwitchEnabled: true, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' };
  const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: '8001' } }];
  const banco = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
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
  for (const alterar of [
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = '0'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; }
  ]) assert.equal((await testar(alterar)).exitCode, 0);
  for (const alterar of [
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.port = 8000; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push({ ...processos[0] }); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.DB_NAME = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-teste'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ state }) => { state.falhaConfig = true; }
  ]) assert.deepEqual(await testar(alterar), { queries: 0, schema: 0, exitCode: 1, validacao: 1 });
  for (const alterar of [
    ({ banco }) => { banco.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ env }) => { env.dbHost = 'producao.example'; }
  ]) assert.deepEqual(await testar(alterar), { queries: 1, schema: 0, exitCode: 1, validacao: 1 });
  assert.equal((await testar(({ state }) => { state.falhaSchema = true; })).exitCode, 1);
  let falhas = 0;
  for (const sucesso of [true, false]) {
    const proc = { exitCode: 0 }; let tentativas = 0;
    await vm.runInNewContext(blocks[1], { process: proc, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() { falhas++; } },
      fetch: async url => { tentativas++; assert.equal(url, 'http://127.0.0.1:8001/health'); return { ok: sucesso }; } });
    assert.equal(proc.exitCode, sucesso ? 0 : 1); assert.equal(tentativas, sucesso ? 1 : 20);
  }
  assert.equal(falhas, 1);
  console.log('Deploy DEV: processo/porta/banco/flags/schema somente leitura, negativas/mutex e health aprovados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
