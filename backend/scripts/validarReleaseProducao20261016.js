'use strict';
// Helper e script reais, configuracao/FS/PM2/banco isolados em memoria.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dotenv = require('dotenv');
const { executar, ROOT, BASE, SOURCE, ALLOWED, ENV_FILE, CA_FILE } = require('./releaseProducao20261016');
const SHA = 'a'.repeat(40);
async function testar(alterar = () => {}) {
  const args = { modo: '--preflight', cwd: `${ROOT}/backend`, expectedSha: SHA,
    env: { deploymentEnvironment: 'production', port: 8000, dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
      dbName: 'gestao_solicitacoes', devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'PILOT', jwtExpiresIn: '8h' },
    runtimeEnv: { PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', PROD_RELEASE_BACKUP_CONFIRMED: 'true', PROD_RELEASE_TIMER_CONFIRMED: 'true' } };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: { pm_exec_path: `${ROOT}/backend/server.js`, PORT: '8000',
    JWT_EXPIRES_IN: '8h', PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true' } }];
  const banco = { uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' };
  const state = { tableExists: true, pending: [...ALLOWED], falha: false, tls: true, dirty: false, branch: 'main', head: SHA, ancestor: true,
    symlink: false, nlink: 1, realpath: ENV_FILE, mudou: false, adulterar: false };
  const files = new Map([[ENV_FILE, 'DB_HOST=gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com\nDB_NAME=gestao_solicitacoes\nJWT_EXPIRES_IN=8h\nPAYMENT_OWNER_APPROVAL_MODE=PILOT\nIDLE_MINUTES=60\nDB_PASSWORD=segredo-fixture\n']]);
  let queries = 0, migrations = 0, schema = 0, writes = 0, erro = null;
  alterar({ args, processos, banco, state, files }); const anterior = { ...args.runtimeEnv }, textoAntes = files.get(ENV_FILE);
  const fileSystem = {
    lstatSync() { return { isFile: () => true, isSymbolicLink: () => state.symlink, nlink: state.nlink, ino: state.mudou && writes ? 2 : 1, mode: 0o100600 }; },
    realpathSync() { return state.realpath; },
    readFileSync(file) {
      if (files.has(file)) return files.get(file);
      const name = path.posix.basename(file); assert(ALLOWED.includes(name));
      return fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8') + (state.adulterar ? '// adulterado' : '');
    },
    writeFileSync(file, text, options) { assert(file.startsWith(ENV_FILE + '.')); assert.equal(options.mode, 0o600); assert.equal(options.flag, 'wx'); assert(!files.has(file)); files.set(file, text); writes++; },
    chmodSync(file, mode) { assert(files.has(file)); assert.equal(mode, 0o600); },
    renameSync(origem, destino) { assert(origem.startsWith(ENV_FILE + '.')); assert.equal(destino, ENV_FILE); files.set(destino, files.get(origem)); files.delete(origem); writes++; }
  };
  try {
    await executar({ ...args, fileSystem, log() {}, validateRequiredEnv() {},
      execFileSync(cmd, params) {
        if (cmd === 'pm2') { assert.deepEqual(params, ['jlist']); return JSON.stringify(processos); }
        assert.equal(cmd, 'git');
        if (params[0] === 'rev-parse') return state.head;
        if (params[0] === 'branch') return state.branch;
        if (params[0] === 'status') return state.dirty ? ' M src/routes.js' : '';
        if (params[0] === 'merge-base') { assert([BASE, SOURCE].includes(params[2])); assert.equal(params[3], SHA); if (!state.ancestor) throw Error('Ancestral ausente'); return ''; }
        assert.equal(params[0], 'show'); assert(params[1].startsWith(SOURCE + ':backend/migrations/'));
        return fs.readFileSync(path.join(__dirname, '../migrations', path.posix.basename(params[1])), 'utf8');
      },
      db: { query: async sql => { queries++;
        if (sql === 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco') return [[banco]];
        assert.equal(sql, "SHOW SESSION STATUS LIKE 'Ssl_cipher'"); return [[{ Value: state.tls ? 'TLS_AES_256_GCM_SHA384' : '' }]];
      } },
      schema: { getMigrationState: async () => state, assertMigrationSourceIsSchemaOnly(name, source) { assert(ALLOWED.includes(name)); assert(!/\b(?:INSERT INTO|UPDATE .+ SET|DELETE FROM)\b/.test(source)); },
        runMigrations: async options => { assert.equal(options.authorized, true); assert.equal(args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true'); migrations++; if (state.falha) throw Error('DDL falhou'); state.pending = []; },
        assertMigrationsUpToDate: async () => { if (state.pending.length) throw Error('Schema pendente'); schema++; } }
    });
  } catch (e) { erro = e; }
  assert.deepEqual(args.runtimeEnv, anterior, 'Flags nao persistidas, inclusive na falha');
  if (args.modo !== '--sessao-12h' || erro) assert.equal(files.get(ENV_FILE), textoAntes, 'Nenhuma mudanca de configuracao fora da etapa propria');
  if (erro) assert(!erro.message.includes('segredo-fixture'));
  return { erro, queries, migrations, schema, writes, files, textoAntes };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.queries, 2); assert.equal(r.migrations, 0); assert.equal(r.writes, 0);
  r = await testar(({ args }) => { args.modo = '--aplicar-migrations'; }); assert.equal(r.erro, null); assert.equal(r.migrations, 1); assert.equal(r.writes, 0);
  r = await testar(({ args, state }) => { args.modo = '--aplicar-migrations'; state.pending = []; }); assert.equal(r.erro, null); assert.equal(r.migrations, 0);
  r = await testar(({ args, state }) => { args.modo = '--sessao-12h'; state.pending = []; }); assert.equal(r.erro, null); assert.equal(r.writes, 3);
  const antes = dotenv.parse(r.textoAntes), depois = dotenv.parse(r.files.get(ENV_FILE)); assert.equal(depois.JWT_EXPIRES_IN, '12h'); delete antes.JWT_EXPIRES_IN; delete depois.JWT_EXPIRES_IN; assert.deepEqual(depois, antes);
  assert([...r.files.keys()].some(file => file.endsWith('.bak') && r.files.get(file) === r.textoAntes));
  for (const modo of ['--sessao-12h', '--verificar']) {
    r = await testar(({ args, state, processos, files }) => { args.modo = modo; state.pending = []; args.env.jwtExpiresIn = '12h'; processos[0].pm2_env.JWT_EXPIRES_IN = '12h';
      args.env.dbSslCaFile = args.runtimeEnv.DB_SSL_CA_FILE = processos[0].pm2_env.DB_SSL_CA_FILE = CA_FILE;
      files.set(ENV_FILE, files.get(ENV_FILE).replace('JWT_EXPIRES_IN=8h', 'JWT_EXPIRES_IN=12h') + `DB_SSL_CA_FILE=${CA_FILE}\n`); });
    assert.equal(r.erro, null); assert.equal(r.writes, 0);
  }
  for (const modo of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED']) {
    r = await testar(({ args, processos }) => { args.env.paymentOwnerApprovalMode = args.runtimeEnv.PAYMENT_OWNER_APPROVAL_MODE = processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = modo; }); assert.equal(r.erro, null);
    for (const outro of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED'].filter(v => v !== modo)) {
      r = await testar(({ args, processos }) => { args.env.paymentOwnerApprovalMode = args.runtimeEnv.PAYMENT_OWNER_APPROVAL_MODE = modo; processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = outro; }); assert(r.erro); assert.equal(r.queries, 0);
    }
  }
  for (const alterar of [
    ({ args }) => { args.modo = '--outro'; }, ({ args }) => { args.cwd = ROOT.replace('main', 'dev') + '/backend'; },
    ({ args }) => { args.env.deploymentEnvironment = 'development'; }, ({ args }) => { args.env.port = 8001; },
    ({ args }) => { args.env.dbHost = 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'; }, ({ args }) => { args.env.dbName = 'outro'; },
    ({ args }) => { args.env.devUserSwitchEnabled = true; }, ({ args }) => { args.expectedSha = 'b'.repeat(40); },
    ({ state }) => { state.head = 'b'.repeat(40); }, ({ state }) => { state.branch = 'refactor/frontend'; },
    ({ state }) => { state.dirty = true; }, ({ state }) => { state.ancestor = false; },
    ({ state }) => { state.symlink = true; }, ({ state }) => { state.nlink = 2; }, ({ state }) => { state.realpath = '/outro/.env'; },
    ({ processos }) => { processos.length = 0; }, ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].name = 'backend-dev'; }, ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/dev/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = 8001; }, ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-fixture'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; }, ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { delete processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE; }, ({ args }) => { args.runtimeEnv.PAYMENT_OWNER_APPROVAL_MODE = 'INVALIDO'; },
    ({ files }) => { files.set(ENV_FILE, files.get(ENV_FILE).replace('DB_NAME=gestao_solicitacoes', 'DB_NAME=outro')); }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.migrations, 0); assert.equal(r.writes, 0); }
  for (const alterar of [
    ({ banco }) => { banco.uuid = '60f043e9-4025-11f1-9a61-06d8a063012d'; }, ({ banco }) => { banco.banco = 'outro'; },
    ({ state }) => { state.tls = false; }, ({ state }) => { state.tableExists = false; }, ({ state }) => { state.pending.push('seed-nao-autorizado.js'); },
    ({ state }) => { state.adulterar = true; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.migrations, 0); assert.equal(r.writes, 0); }
  for (const modo of ['--aplicar-migrations', '--sessao-12h']) for (const key of ['PROD_RELEASE_BACKUP_CONFIRMED', 'PROD_RELEASE_TIMER_CONFIRMED']) {
    r = await testar(({ args, state }) => { args.modo = modo; if (modo === '--sessao-12h') state.pending = []; delete args.runtimeEnv[key]; });
    assert(r.erro); assert.equal(r.migrations, 0); assert.equal(r.writes, 0);
  }
  r = await testar(({ args, state }) => { args.modo = '--aplicar-migrations'; args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'false'; state.falha = true; }); assert(r.erro); assert.equal(r.writes, 0);
  r = await testar(({ args, state }) => { args.modo = '--sessao-12h'; state.pending = []; state.mudou = true; }); assert(r.erro); assert.equal(r.writes, 2);
  r = await testar(({ args, state }) => { args.modo = '--sessao-12h'; state.pending = [ALLOWED[0]]; }); assert(r.erro); assert.equal(r.writes, 0);
  r = await testar(({ args, state }) => { args.modo = '--verificar'; state.pending = []; }); assert(r.erro); assert.equal(r.writes, 0);
  const transicao = ({ args, processos, files }) => {
    args.env.dbSslCaFile = args.runtimeEnv.DB_SSL_CA_FILE = CA_FILE; processos[0].pm2_env.DB_SSL_CA_FILE = '';
    args.runtimeEnv.PROD_RELEASE_TLS_CONFIRMED = 'true'; files.set(ENV_FILE, files.get(ENV_FILE) + `DB_SSL_CA_FILE=${CA_FILE}\n`);
  };
  r = await testar(transicao); assert.equal(r.erro, null); assert.equal(r.writes, 0);
  for (const mudar of [
    ({ args }) => { delete args.runtimeEnv.PROD_RELEASE_TLS_CONFIRMED; },
    ({ args }) => { delete args.runtimeEnv.PROD_RELEASE_BACKUP_CONFIRMED; },
    ({ args }) => { delete args.runtimeEnv.PROD_RELEASE_TIMER_CONFIRMED; },
    ({ args }) => { args.runtimeEnv.DB_SSL_CA_FILE = '/outro.pem'; },
    ({ args }) => { args.env.dbSslCaFile = '/outro.pem'; },
    ({ processos }) => { processos[0].pm2_env.DB_SSL_CA_FILE = '/outra-ca.pem'; },
    ({ files }) => { files.set(ENV_FILE, files.get(ENV_FILE).replace(CA_FILE, '/outro.pem')); },
    ({ args }) => { args.modo = '--verificar'; }
  ]) { r = await testar(ctx => { transicao(ctx); mudar(ctx); }); assert(r.erro); assert.equal(r.queries, 0); assert.equal(r.writes, 0); }
  const source = fs.readFileSync(path.join(__dirname, '../../ops/deploy/atualizar-prod-pendencias-20261016.sh'), 'utf8');
  for (const texto of ['flock -n 9', 'fluxy-prod-db-backup.timer', 'test "$(git branch --show-current)" = main', '--preflight "$1"', '--aplicar-migrations "$1"', '--sessao-12h "$1"', 'JWT_EXPIRES_IN=12h pm2 restart backend-solicitacoes --update-env', '--verificar "$1"']) assert(source.includes(texto), texto);
  assert(source.indexOf('--preflight "$1"') < source.indexOf('--aplicar-migrations "$1"'));
  assert(source.indexOf('--aplicar-migrations "$1"') < source.indexOf('--sessao-12h "$1"'));
  assert(source.indexOf('--sessao-12h "$1"') < source.indexOf('pm2 restart'));
  assert(!source.includes('pm2 restart backend-dev')); assert(!source.includes('npm run migrate')); assert(!source.includes('PAYMENT_OWNER_APPROVAL_MODE='));
  const health = /node <<'NODE'\r?\n([^]*?)\r?\nNODE/.exec(source)[1];
  for (const ok of [true, false]) {
    const proc = { exitCode: 0 }; let tentativas = 0;
    await vm.runInNewContext(health, { process: proc, AbortSignal, console: { log() {}, error() {} }, setTimeout: fn => fn(), fetch: async url => { assert.equal(url, 'http://127.0.0.1:8000/health'); tentativas++; return { ok, status: 200 }; } });
    assert.equal(proc.exitCode, ok ? 0 : 1); assert.equal(tentativas, ok ? 1 : 20);
  }
  console.log('Release PROD: identidade/PM2/8000/TLS/commit, tres migrations homologadas, backup/timer, retomada/falhas, quatro modos preservados e transicoes negadas, sessao12h exclusiva com backup privado e health. Sem banco/EC2/rede/.env real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
