'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), dotenv = require('dotenv');
const { executar, conteudoTls, CA_URL } = require('./configurarTlsProducao20261016');
const { ROOT, ENV_FILE, CA_FILE, ALLOWED } = require('./releaseProducao20261016');
const SHA = 'a'.repeat(40), PEM = '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n';
const ORIGINAL = 'DB_HOST=gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com\nDB_NAME=gestao_solicitacoes\nDB_PASSWORD=segredo-fixture\nPAYMENT_OWNER_APPROVAL_MODE=PILOT\nJWT_EXPIRES_IN=8h\nIDLE_MINUTES=60\n';
async function testar(alterar = () => {}) {
  const args = { modo: '--aplicar', expectedSha: SHA, cwd: ROOT + '/backend',
    env: { deploymentEnvironment: 'production', port: 8000, dbPort: 3306, dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
      dbName: 'gestao_solicitacoes', dbSslCaFile: '', devUserSwitchEnabled: false, productionUserSwitchEnabled: true, paymentOwnerApprovalMode: 'PILOT' },
    runtimeEnv: { PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', PROD_RELEASE_TLS_CONFIRMED: 'true', PROD_RELEASE_BACKUP_CONFIRMED: 'true', PROD_RELEASE_TIMER_CONFIRMED: 'true' } };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: { pm_exec_path: ROOT + '/backend/server.js', PORT: 8000, PAYMENT_OWNER_APPROVAL_MODE: 'PILOT' } }];
  const files = new Map([[ENV_FILE, ORIGINAL]]), writes = [];
  const state = { tls: true, identity: true, fetchOk: true, pem: PEM, validPem: true, pending: [...ALLOWED], tableExists: true,
    envLink: false, caLink: false, gitLink: false, nlink: 1, race: false, dirty: false, connectFail: false, realpath: false, closed: 0 };
  alterar({ args, processos, files, state }); const antes = files.get(ENV_FILE), runtimeAntes = { ...args.runtimeEnv };
  const fileSystem = {
    lstatSync(file) {
      if (file === ROOT + '/.git') return { isDirectory: () => true, isSymbolicLink: () => state.gitLink };
      return { isFile: () => true, isSymbolicLink: () => file === ENV_FILE ? state.envLink : state.caLink, nlink: state.nlink,
        ino: state.race && writes.length ? 2 : 1, mode: 0o100600 };
    }, realpathSync: file => state.realpath ? '/outro' : file,
    readFileSync(file) { assert(files.has(file)); return files.get(file); }, existsSync: file => files.has(file),
    writeFileSync(file, text, options) { assert(file === CA_FILE || file.startsWith(ENV_FILE + '.')); assert.equal(options.flag, 'wx'); assert.equal(options.mode, 0o600); assert(!files.has(file)); files.set(file, text); writes.push(file); },
    chmodSync(file, mode) { assert(files.has(file)); assert.equal(mode, 0o600); },
    renameSync(origem, destino) { assert(origem.startsWith(ENV_FILE + '.tls-')); assert.equal(destino, ENV_FILE); files.set(destino, files.get(origem)); files.delete(origem); writes.push(destino); }
  };
  let erro = null, fetches = 0, queries = 0;
  try {
    await executar({ ...args, fileSystem, log() {}, validateRequiredEnv() {},
      execFileSync(cmd, params) {
        if (cmd === 'pm2') { assert.deepEqual(params, ['jlist']); return JSON.stringify(processos); }
        assert.equal(cmd, 'git');
        if (params[0] === 'rev-parse') return SHA;
        if (params[0] === 'branch') return 'main';
        if (params[0] === 'status') return state.dirty ? ' M routes.js' : '';
        assert.equal(params[0], 'merge-base'); return '';
      },
      fetcher: async (url, options) => { fetches++; assert.equal(url, CA_URL); assert.equal(options.redirect, 'error'); assert(options.signal); return { ok: state.fetchOk, text: async () => state.pem }; },
      validarPem(pem) { assert.equal(pem, state.pem); if (!state.validPem) throw Error('PEM invalido'); },
      criarConexao(options) {
        assert.equal(options.host, args.env.dbHost); assert.equal(options.dialectOptions.ssl.ca, state.pem);
        assert.equal(options.dialectOptions.ssl.rejectUnauthorized, true); assert.equal(options.dialectOptions.ssl.verifyIdentity, true);
        assert.equal(options.logging, false); assert.equal(options.pool.max, 1);
        return { query: async sql => { queries++; if (state.connectFail) throw Error('Certificado/identidade recusado');
          if (sql.startsWith('SELECT ')) return [[{ uuid: state.identity ? '5ed4b970-009f-11f1-809c-0ad0e0c90c53' : 'dev', banco: 'gestao_solicitacoes' }]];
          assert.equal(sql, "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
          return [[{ Variable_name: 'Ssl_cipher', Value: state.tls ? 'TLS_AES_256_GCM_SHA384' : '' }, { Variable_name: 'Ssl_version', Value: state.tls ? 'TLSv1.3' : '' }]];
        }, close: async () => { state.closed++; } };
      }, schema: { getMigrationState: async () => ({ tableExists: state.tableExists, pending: state.pending }) }
    });
  } catch (e) { erro = e; }
  assert.deepEqual(args.runtimeEnv, runtimeAntes); if (erro) { assert.equal(files.get(ENV_FILE), antes); assert(!erro.message.includes('segredo-fixture')); }
  return { erro, files, writes, fetches, queries, state, antes };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.state.closed, 1); assert.equal(r.queries, 2);
  const depois = dotenv.parse(r.files.get(ENV_FILE)), antes = dotenv.parse(ORIGINAL);
  assert.equal(depois.DB_SSL_CA_FILE, CA_FILE); delete depois.DB_SSL_CA_FILE; assert.deepEqual(depois, antes);
  assert(r.writes.includes(CA_FILE)); assert(r.writes.some(f => f.endsWith('.bak') && r.files.get(f) === ORIGINAL));
  for (const key of ['PROD_RELEASE_TLS_CONFIRMED', 'PROD_RELEASE_BACKUP_CONFIRMED', 'PROD_RELEASE_TIMER_CONFIRMED']) {
    r = await testar(({ args }) => { delete args.runtimeEnv[key]; }); assert(r.erro); assert.equal(r.fetches, 0); assert.equal(r.writes.length, 0);
  }
  r = await testar(({ args }) => { args.modo = '--verificar'; }); assert.equal(r.erro, null); assert.equal(r.writes.length, 0);
  r = await testar(({ files, args, processos }) => { files.set(ENV_FILE, conteudoTls(ORIGINAL)); files.set(CA_FILE, PEM); args.env.dbSslCaFile = args.runtimeEnv.DB_SSL_CA_FILE = CA_FILE; processos[0].pm2_env.DB_SSL_CA_FILE = ''; });
  assert.equal(r.erro, null); assert.equal(r.writes.length, 0, 'Retomada nao recria certificado/backup ou altera PM2');
  for (const alterar of [
    ({ args }) => { args.env.deploymentEnvironment = 'development'; }, ({ args }) => { args.cwd = ROOT.replace('main', 'dev') + '/backend'; },
    ({ args }) => { args.env.port = 8001; }, ({ args }) => { args.env.dbHost = 'staging'; },
    ({ args }) => { args.expectedSha = 'b'.repeat(40); }, ({ state }) => { state.dirty = true; },
    ({ processos }) => { processos[0].name = 'backend-dev'; }, ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; },
    ({ state }) => { state.envLink = true; }, ({ state }) => { state.nlink = 2; }, ({ state }) => { state.realpath = true; },
    ({ files }) => { files.set(ENV_FILE, ORIGINAL + 'DB_SSL_CA_FILE=/outra-ca.pem\n'); }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.fetches, 0); assert.equal(r.writes.length, 0); }
  for (const alterar of [
    ({ state }) => { state.fetchOk = false; }, ({ state }) => { state.pem = 'HTML'; }, ({ state }) => { state.pem = PEM.repeat(20000); },
    ({ state }) => { state.validPem = false; }, ({ state }) => { state.connectFail = true; },
    ({ state }) => { state.identity = false; }, ({ state }) => { state.tls = false; },
    ({ state }) => { state.tableExists = false; }, ({ state }) => { state.pending.push('migration-extra.js'); },
    ({ state }) => { state.gitLink = true; }, ({ state, files }) => { state.caLink = true; files.set(CA_FILE, PEM); },
    ({ files }) => { files.set(CA_FILE, PEM + 'outro'); }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.writes.length, 0); }
  r = await testar(({ state }) => { state.race = true; }); assert(r.erro); assert(!r.writes.includes(ENV_FILE));
  assert.throws(() => conteudoTls(ORIGINAL + 'DB_SSL_CA_FILE="linha\noutra"\n'));
  // Adaptador ativo real: TLS autenticado quando configurado, sem alterar modo legado.
  const source = fs.readFileSync(path.join(__dirname, '../src/database/index.js'), 'utf8');
  for (const configurado of [false, true]) {
    let options;
    vm.runInNewContext(source, { module: { exports: {} }, require(id) {
      if (id === 'sequelize') return { Sequelize: class { constructor(_name, _user, _pass, o) { options = o; } } };
      if (id === 'fs') return { readFileSync: () => PEM };
      if (id === '../config/env') return { env: { dbSslCaFile: configurado ? '/ca.pem' : '' } };
      if (id === '../observability/comprasPerformance') return {};
      throw Error('Import inesperado: ' + id);
    } });
    if (configurado) { assert.equal(options.dialectOptions.ssl.verifyIdentity, true); assert.equal(options.dialectOptions.ssl.rejectUnauthorized, true); }
    else assert.equal(options.dialectOptions, undefined);
  }
  console.log('TLS PROD: CA oficial/teste isolado autenticado antes de gravar, identidade/escopo/PILOT, backup0600, unica chave, retomada/race/symlinks/certificado diferente, falhas fechadas e adaptador ativo aprovados. Sem rede/banco/EC2/.env real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
