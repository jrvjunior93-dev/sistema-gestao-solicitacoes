'use strict';
// Todas as E/S injetadas: nao carrega config/models, nao acessa banco/EC2/PM2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { executar, BACKEND, MIGRATIONS, IDENTIDADE_SQL, TLS_SQL, JSON_SQL, COLUNAS_SQL } = require('./promoverSchemaProducao20261018');
async function testar(alterar = () => {}) {
  const vars = { DB_HOST: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    DB_NAME: 'gestao_solicitacoes', DB_SSL_CA_FILE: '/certs/rds.pem', DEPLOYMENT_ENV: 'production',
    PORT: '8000', JWT_EXPIRES_IN: '12h', PAYMENT_OWNER_APPROVAL_MODE: 'PILOT',
    DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true', DB_PASSWORD: 'segredo-fixture' };
  const args = { modo: '--aplicar', cwd: BACKEND, env: { deploymentEnvironment: 'production', port: 8000,
    dbHost: vars.DB_HOST, dbName: vars.DB_NAME, dbSslCaFile: vars.DB_SSL_CA_FILE,
    jwtExpiresIn: '12h', paymentOwnerApprovalMode: 'PILOT', devUserSwitchEnabled: false, productionUserSwitchEnabled: true },
  runtimeEnv: { ...vars, CONFIRM_PROD_BACKUP: 'SIM', CONFIRM_PROD_BACKUP_TIMER: 'SIM' } };
  const arquivo = { ...vars };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: { ...vars, pm_exec_path: `${BACKEND}/server.js`, watch: false } },
    { name: 'backend-dev', pm2_env: { PORT: '8001', watch: false } }];
  const identidade = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const colunas = [{ tabela: 'rh_colaboradores', coluna: 'data_inicio_efetivo_obra', tipo: 'date', anulavel: 'YES' },
    { tabela: 'titulos_financeiros', coluna: 'bloqueio_pagamento_proprietario', tipo: 'json', anulavel: 'YES' }];
  const state = { tableExists: true, pending: [...MIGRATIONS], colunas: [], json: 7, falha: false, caExiste: true,
    tls: [{ Variable_name: 'Ssl_cipher', Value: 'TLS_AES_256_GCM_SHA384' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }] };
  alterar({ args, arquivo, processos, identidade, state, colunas });
  const envAnterior = { ...args.runtimeEnv }, pmAnterior = JSON.stringify(processos), envArquivo = JSON.stringify(arquivo);
  let erro = null, migrations = 0, schema = 0, queries = 0;
  try {
    await executar({ ...args, validateRequiredEnv() {}, execFileSync(command, argv) {
      assert.equal(command, 'pm2'); assert.deepEqual(argv, ['jlist']); return JSON.stringify(processos);
    }, fileSystem: {
      readFileSync(file) { assert.equal(file, `${BACKEND}/.env`); return Object.entries(arquivo).map(([k, v]) => `${k}=${v}`).join('\n'); },
      statSync(file) { assert.equal(file, '/certs/rds.pem'); return { isFile: () => state.caExiste }; }
    }, db: { async query(sql) {
      queries++;
      assert(/^(SELECT|SHOW) /.test(sql), 'Somente leitura fora do runner de schema');
      if (sql === IDENTIDADE_SQL) return [[identidade]];
      if (sql === TLS_SQL) return [state.tls];
      if (sql === JSON_SQL) return [[{ item_ok: state.json }]];
      assert.equal(sql, COLUNAS_SQL); return [state.colunas];
    } }, schema: {
      getMigrationState: async () => state,
      async runMigrations(options) {
        migrations++; assert.deepEqual(options, { authorized: true });
        assert.equal(args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
        if (state.falha) throw Error('DDL interrompido QA');
        state.pending = []; state.colunas = colunas;
      },
      async assertMigrationsUpToDate() { schema++; assert.equal(state.pending.length, 0); }
    }, log(message) { assert(!message.includes('segredo-fixture')); } });
  } catch (e) { erro = e; }
  assert.deepEqual(args.runtimeEnv, envAnterior, 'Autorizacao temporaria restaurada mesmo em falha');
  assert.equal(JSON.stringify(processos), pmAnterior, 'Nenhum processo alterado');
  assert.equal(JSON.stringify(arquivo), envArquivo, 'Nenhuma configuracao alterada');
  if (erro) assert(!erro.message.includes('segredo-fixture'));
  return { erro, migrations, schema, queries };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.migrations, 1); assert.equal(r.schema, 1);
  r = await testar(({ args }) => { args.modo = '--verificar'; delete args.runtimeEnv.CONFIRM_PROD_BACKUP; });
  assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 0);
  for (const modo of ['--verificar', '--aplicar', '--concluido']) {
    r = await testar(({ args, state, colunas }) => { args.modo = modo; state.pending = []; state.colunas = colunas; });
    assert.equal(r.erro, null); assert.equal(r.migrations, 0); assert.equal(r.schema, 1);
  }
  r = await testar(({ state, colunas }) => { state.pending = [MIGRATIONS[1]]; state.colunas = [colunas[0]]; });
  assert.equal(r.erro, null); assert.equal(r.migrations, 1);
  // Coluna criada antes de uma interrupcao, ainda nao registrada no ledger.
  r = await testar(({ state, colunas }) => { state.colunas = colunas; }); assert.equal(r.erro, null);
  for (const alterar of [
    ({ args }) => { args.modo = '--outro'; },
    ({ args }) => { args.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend'; },
    ({ args }) => { args.env.deploymentEnvironment = 'development'; },
    ({ args }) => { args.env.port = 8001; },
    ({ args }) => { args.env.dbHost = 'fluxy-staging'; },
    ({ args }) => { args.env.dbName = 'outro'; },
    ({ processos }) => { processos.shift(); },
    ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/outro/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8001'; },
    ({ processos }) => { processos[0].pm2_env.watch = true; },
    ({ processos }) => { processos[0].pm2_env.watch = ['backend']; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'outro'; },
    ({ arquivo }) => { arquivo.DB_HOST = 'outro'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ arquivo }) => { arquivo.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ arquivo }) => { arquivo.DEV_USER_SWITCH_ENABLED = 'true'; },
    ({ arquivo, processos }) => { delete arquivo.PRODUCTION_USER_SWITCH_ENABLED; delete processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED; },
    ({ arquivo, processos }) => { delete arquivo.PAYMENT_OWNER_APPROVAL_MODE; delete processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE; },
    ({ args }) => { args.env.jwtExpiresIn = '8h'; },
    ({ arquivo }) => { arquivo.JWT_EXPIRES_IN = '8h'; },
    ({ args }) => { args.env.dbSslCaFile = ''; },
    ({ state }) => { state.caExiste = false; },
    ({ args }) => { args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    ({ processos }) => { processos[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    ({ arquivo }) => { arquivo.ALLOW_SCHEMA_MIGRATIONS = 'true'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.migrations, 0); }
  for (const alterar of [
    ({ identidade }) => { identidade.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ identidade }) => { identidade.banco = 'outro'; },
    ({ state }) => { state.tls = []; },
    ({ state }) => { state.tls[0].Value = ''; },
    ({ state }) => { state.tls[1].Value = ''; },
    ({ state }) => { state.json = 0; },
    ({ state }) => { state.pending.push('migration-nao-autorizada.js'); },
    ({ state }) => { state.tableExists = false; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_PROD_BACKUP; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_PROD_BACKUP_TIMER; },
    ({ args }) => { args.modo = '--concluido'; },
    ({ state, colunas }) => { state.colunas = [{ ...colunas[0], tipo: 'datetime' }]; },
    ({ state, colunas }) => { state.colunas = [{ ...colunas[1], anulavel: 'NO' }]; },
    ({ state, colunas }) => { state.pending = []; state.colunas = [colunas[0]]; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.migrations, 0); }
  r = await testar(({ state }) => { state.falha = true; }); assert(r.erro); assert.equal(r.migrations, 1); assert.equal(r.schema, 0);
  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-20261018.sh'), 'utf8');
  assert.match(shell, /git merge --ff-only/); assert.match(shell, /fluxy-prod-deploy.lock/);
  assert.match(shell, /pm2 restart backend-solicitacoes\n/);
  assert(!/pm2\s+(?:restart|reload|delete|stop|save)\s+(?:all|backend-dev)/.test(shell));
  assert(!/pm2 restart backend-solicitacoes --update-env/.test(shell));
  assert(shell.indexOf('PM2 PRODUCAO/porta/watch diverge') < shell.indexOf('git merge --ff-only'));
  assert(shell.indexOf('promoverSchemaProducao20261018.js --concluido') < shell.indexOf('pm2 restart backend-solicitacoes'));
  for (const nome of MIGRATIONS) {
    const source = fs.readFileSync(path.resolve(__dirname, '../migrations', nome), 'utf8');
    assert.match(source, /columnExists/); assert.match(source, /allowNull: true/);
    assert(!/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|DROP TABLE|TRUNCATE)\b/i.test(source));
  }
  console.log('Deploy PRODUCAO: identidade/PM2/watch/TLS/12h/flags, backup+timer, whitelist de duas migrations, retomada parcial, colunas, falhas e isolamento DEV aprovados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
