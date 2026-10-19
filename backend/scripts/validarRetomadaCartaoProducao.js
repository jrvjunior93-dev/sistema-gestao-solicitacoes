'use strict';
// E/S inteiramente injetada: nenhum banco, .env, PM2 ou rede reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { executar, MIGRATION } = require('./aplicarMigrationCartaoParcelamentoProducao');
const { BACKEND, IDENTIDADE_SQL, TLS_SQL, JSON_SQL } = require('./promoverSchemaProducao20261018');
const { mensagemSegura } = require('./verificarFinanceiroProducao20261019');

async function testar(alterar = () => {}) {
  const vars = { DB_HOST: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    DB_NAME: 'gestao_solicitacoes', PORT: '8000', DEPLOYMENT_ENV: 'production',
    DB_SSL_CA_FILE: '/certs/rds.pem', JWT_EXPIRES_IN: '12h', DB_PASSWORD: 'segredo-fixture',
    PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true' };
  const arquivo = { ...vars }, processos = [{ name: 'backend-solicitacoes',
    pm2_env: { ...vars, pm_exec_path: `${BACKEND}/server.js`, watch: false } }];
  const args = { modo: '--aplicar', cwd: BACKEND, runtimeEnv: { ...vars, CONFIRM_PROD_BACKUP: 'SIM', CONFIRM_PROD_BACKUP_TIMER: 'SIM' },
    env: { dbHost: vars.DB_HOST, dbName: vars.DB_NAME, port: 8000, deploymentEnvironment: 'production',
      dbSslCaFile: vars.DB_SSL_CA_FILE, jwtExpiresIn: '12h', paymentOwnerApprovalMode: 'PILOT',
      devUserSwitchEnabled: false, productionUserSwitchEnabled: true } };
  const state = { tableExists: true, pending: [MIGRATION], falha: false, uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53' };
  alterar({ args, state, processos, arquivo });
  const antes = JSON.stringify({ arquivo, processos, runtime: args.runtimeEnv });
  let erro = null, aplicacoes = 0, asserts = 0;
  try {
    await executar({ ...args, validateRequiredEnv() {}, log(message) { assert(!message.includes('segredo-fixture')); },
      execFileSync(command, argv) { assert.equal(command, 'pm2'); assert.deepEqual(argv, ['jlist']); return JSON.stringify(processos); },
      fileSystem: { readFileSync(file) { assert.equal(file, `${BACKEND}/.env`); return Object.entries(arquivo).map(([k,v]) => `${k}=${v}`).join('\n'); },
        statSync(file) { assert.equal(file, '/certs/rds.pem'); return { isFile: () => true }; } },
      db: { async query(sql) {
        if (sql === IDENTIDADE_SQL) return [[{ uuid: state.uuid, banco: 'gestao_solicitacoes' }]];
        if (sql === TLS_SQL) return [[{ Variable_name: 'Ssl_cipher', Value: 'cipher' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
        assert.equal(sql, JSON_SQL); return [[{ item_ok: 7 }]];
      } }, schema: {
        async getMigrationState() { return state; },
        async runMigrations(options) {
          aplicacoes++; assert.deepEqual(state.pending, [MIGRATION]);
          assert.deepEqual(options, { authorized: true }); assert.equal(args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
          if (state.falha) throw Error('DDL interrompido QA');
          state.pending = [];
        },
        async assertMigrationsUpToDate() { asserts++; assert.equal(state.pending.length, 0); }
      } });
  } catch (e) { erro = e; }
  assert.equal(JSON.stringify({ arquivo, processos, runtime: args.runtimeEnv }), antes);
  return { erro, aplicacoes, asserts };
}

(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.aplicacoes, 1); assert.equal(r.asserts, 1);
  r = await testar(({ args }) => { args.modo = '--verificar'; delete args.runtimeEnv.CONFIRM_PROD_BACKUP; });
  assert.equal(r.erro, null); assert.equal(r.aplicacoes, 0); assert.equal(r.asserts, 0);
  for (const modo of ['--verificar', '--aplicar', '--concluido']) {
    r = await testar(({ args, state }) => { args.modo = modo; state.pending = []; });
    assert.equal(r.erro, null); assert.equal(r.aplicacoes, 0); assert.equal(r.asserts, 1);
  }
  for (const alterar of [
    ({ args }) => { args.modo = '--concluido'; },
    ({ args }) => { args.modo = '--outro'; },
    ({ state }) => { state.pending.push('202610180002_bloqueio_pagamento_proprietario.js'); },
    ({ state }) => { state.pending = ['estranha.js']; },
    ({ state }) => { state.tableExists = false; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_PROD_BACKUP; },
    ({ args }) => { delete args.runtimeEnv.CONFIRM_PROD_BACKUP_TIMER; },
    ({ args }) => { args.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend'; },
    ({ args }) => { args.env.port = 8001; },
    ({ state }) => { state.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; },
    ({ processos }) => { processos[0].pm2_env.watch = true; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    ({ args }) => { args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.aplicacoes, 0); }
  r = await testar(({ state }) => { state.falha = true; }); assert(r.erro); assert.equal(r.aplicacoes, 1); assert.equal(r.asserts, 0);
  assert.equal(mensagemSegura(Error('Pendencias fora do pacote: ' + MIGRATION)), 'Pendencias fora do pacote: ' + MIGRATION);
  assert(!mensagemSegura(Error('password=segredo-fixture')).includes('segredo-fixture'));

  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/concluir-producao-financeiro-20261019.sh'), 'utf8');
  const merge = shell.indexOf('git merge --ff-only'), aplicar = shell.indexOf('aplicarMigrationCartaoParcelamentoProducao.js --aplicar');
  const restart = shell.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > shell.indexOf('p.watch'));
  assert(merge < aplicar && aplicar < restart);
  assert(shell.indexOf('verificarFinanceiroProducao20261019.js --verificar') < restart);
  for (const texto of ["':!backend/scripts/**' ':!ops/deploy/**' ':!docs/**'", 'flock -n 9',
    'git merge-base --is-ancestor HEAD', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'http://127.0.0.1:8000/health', 'CONFIRM_PROD_BACKUP_TIMER']) assert(shell.includes(texto), texto);
  assert(shell.match(/test "\$env_hash_prod"/g).length >= 3);
  assert.deepEqual(shell.match(/^\s*pm2\s+.+$/gm).map(s => s.trim()), ['pm2 restart backend-solicitacoes']);
  assert(!/--update-env|npm run migrate|pm2 restart backend-dev|\bssh\b|ALLOW_SCHEMA_MIGRATIONS=true|simularRegularizacaoTitulos\.js/.test(shell));
  console.log('Retomada PRODUCAO: migration unica, modo leitura, idempotencia, falha/restauracao da autorizacao, backup/timer, UUID/PM2/flags, inventario/erro seguro e restart exclusivo aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
