'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
let network = 0;
for (const [name, methods] of [['node:http',['request','get']],['node:https',['request','get']],['node:net',['connect','createConnection']],['node:tls',['connect']]]) {
  for (const method of methods) require(name)[method] = () => { network++; throw Error('REDE_REAL_PROIBIDA'); };
}
global.fetch = () => { network++; throw Error('REDE_REAL_PROIBIDA'); };
const root = '../src/modules/fiscal/services/nsdocs/manual/';
const { SETTINGS, FILE, loadSettings, effectiveSettings, saveSettings } = require(root + 'captureSettings');
const { PRIVATE_DIR } = require(root + 'policy');
const { MIGRATION, assertStructuralSql, applyOnConnection, migrateDev } = require(root + 'migrationDev');
const setup = require('./nsdocsDevSetup');
const fails = code => error => error.code === code;
function memory() {
  const files = new Map(), fds = new Map(); let next = 1;
  const stat = file => ({ uid: 1000, mode: file === PRIVATE_DIR ? 0o700 : 0o600, nlink: 1,
    size: Buffer.byteLength(files.get(file) || ''), isDirectory: () => file === PRIVATE_DIR,
    isFile: () => file !== PRIVATE_DIR, isSymbolicLink: () => false });
  const io = { existsSync: file => files.has(file), lstatSync: stat, realpathSync: value => value,
    openSync(file, flags) { if (files.has(file) && flags & fs.constants.O_EXCL) throw Error('EXISTE');
      if (!files.has(file) && !(flags & fs.constants.O_CREAT)) throw Error('AUSENTE');
      if (!files.has(file)) files.set(file, ''); fds.set(next, file); return next++; },
    fstatSync: fd => stat(fds.get(fd)), readFileSync: fd => files.get(fds.get(fd)),
    writeFileSync: (fd, text) => files.set(fds.get(fd), text), closeSync: fd => fds.delete(fd),
    unlinkSync: file => files.delete(file), fsyncSync() {} };
  return { io, files };
}
test('configuracao privada idempotente; valores fixos, lock, sem editar env ou credenciais', async () => {
  const f = memory(), env = { FISCAL_S3_BUCKET: 'fluxy-fiscal-dev' }, before = { ...env };
  assert.equal(loadSettings(f.io), null); assert.equal(await saveSettings(f.io), true);
  assert.equal(await saveSettings(f.io), false); assert.deepEqual(loadSettings(f.io), SETTINGS);
  assert.deepEqual(effectiveSettings(env, f.io), { ...env, ...SETTINGS }); assert.deepEqual(env, before);
  assert.equal([...f.files.keys()].length, 1); assert.equal([...f.files.keys()][0], FILE);
  assert.throws(() => effectiveSettings({ NSDOCS_DEV_S3_BUCKET: 'producao' }, f.io), fails('NSDOCS_STORAGE_CONFIG_CONFLITANTE'));
  f.files.set(FILE, JSON.stringify({ ...SETTINGS, NSDOCS_DEV_S3_OWNER: '000000000000' }));
  assert.throws(() => loadSettings(f.io), fails('NSDOCS_STORAGE_CONFIG_INVALIDA'));
});
function setupFixture(changes = {}) {
  const calls = [], result = [];
  const dependencies = { company: async () => ({ id: 2, cnpj: '27123008000100', ativo: true }), guard() {},
    env: { FISCAL_S3_BUCKET:'fluxy-fiscal-dev', FISCAL_S3_REGION:'us-east-2', FISCAL_S3_PREFIX:'dev', ...changes.env },
    readDatabase: async action => action({}), schemaState: async () => ({ pending:[MIGRATION], applied:false }),
    repository: () => ({ fiscalCompany: async () => changes.noCompany ? null : 9 }),
    save: async () => { calls.push('save-private'); return true; },
    storageConfig: () => ({ bucket:'fluxy-fiscal-dev', roleArn:SETTINGS.NSDOCS_DEV_S3_ROLE_ARN }),
    storage: () => ({ preflight: async () => { calls.push('s3-read'); }, close: () => calls.push('close') }),
    migrate: async () => { calls.push('migration'); return { applied_now:true, migration:MIGRATION }; }, log: value => result.push(value) };
  return { dependencies, calls, result };
}
test('conferir somente le banco e relata alinhamento; configurar nao chama AWS ou migration', async () => {
  const f = setupFixture(); await setup.main(['--conferir'], f.dependencies); assert.deepEqual(f.calls, []);
  assert.deepEqual(f.result[0].pending, [MIGRATION]);
  await setup.main(['--configurar-storage'], f.dependencies); assert.deepEqual(f.calls, ['save-private']);
  assert.equal(f.result[1].env_pm2_intactos, true);
});
test('preflight IAM/S3 independe da migration pendente; nunca grava objeto ou faz NSDOCS', async () => {
  const f = setupFixture(); await setup.main(['--preflight-infra'], f.dependencies);
  assert.deepEqual(f.calls, ['s3-read','close']); assert.equal(f.result[0].gravacao_s3_testada, false);
  assert.equal(f.result[0].chamadas_nsdocs, 0);
});
test('storage antigo divergente ou empresa ausente interrompem antes de configurar/AWS/DDL', async () => {
  for (const changes of [{ env:{FISCAL_S3_BUCKET:'outro-bucket'} }, { env:{FISCAL_S3_PREFIX:'prod'} }, { noCompany:true }]) {
    const f = setupFixture(changes); await assert.rejects(setup.main(['--configurar-storage'], f.dependencies));
    await assert.rejects(setup.main(['--migration'], f.dependencies)); assert.deepEqual(f.calls, []);
  }
});
test('alinhamento respeita defaults existentes de regiao/prefixo, sem alterar env', () => {
  const env = { FISCAL_S3_BUCKET:'fluxy-fiscal-dev', AWS_REGION:'us-east-2' }, before = {...env};
  assert(Object.values(setup.alignment(env)).every(Boolean)); assert.deepEqual(env, before);
  assert.equal(setup.alignment({...env,FISCAL_ENV:'prod'}).prefixo_fiscal_alinhado,false);
  assert.equal(setup.alignment({...env,AWS_REGION:'us-east-1'}).regiao_fiscal_alinhada,false);
});
test('SQL dedicado aceita DDL novo e leitura; nega DML, DROP e alteracoes de outras tabelas', () => {
  for (const sql of ['CREATE TABLE IF NOT EXISTS `fiscal_nsdocs_captures` (id VARCHAR(36))',
    'ALTER TABLE `fiscal_nsdocs_observations` ADD UNIQUE INDEX x (capture_id,access_key)',
    'SELECT * FROM information_schema.TABLES', 'SHOW INDEX FROM fiscal_nsdocs_observations']) assertStructuralSql(sql);
  for (const sql of ['UPDATE fiscal_nsdocs_captures SET state=1', 'INSERT INTO schema_migrations VALUES (1)',
    'DROP TABLE fiscal_nsdocs_captures', 'CREATE TABLE users (id int)', 'ALTER TABLE titulos_financeiros ADD x int',
    'CREATE TABLE fiscal_nsdocs_captures_extra (id int)']) assert.throws(() => assertStructuralSql(sql));
});
function migrationFixture(changes = {}) {
  const calls = [], executed = changes.applied ? ['base.js',MIGRATION] : ['base.js'];
  const sequelize = { async query(sql, options) {
    calls.push(sql);
    if (sql.startsWith('SHOW')) return [[{ Value:changes.noTls ? '' : 'TLS' }]];
    if (sql.includes('server_uuid')) return [[{ uuid:changes.badDb ? 'errado' : '60f043e9-4025-11f1-9a61-06d8a063012d', banco:'gestao_solicitacoes' }]];
    if (sql.includes('GET_LOCK')) return [[{ acquired:1 }]];
    if (sql.startsWith('SELECT name')) return [executed.map(name => ({name}))];
    if (sql.startsWith('INSERT')) { assert.deepEqual(options.replacements, [MIGRATION]); executed.push(MIGRATION); }
    return [[],{}];
  }, getQueryInterface() { return {}; } };
  const dependencies = { files:changes.otherPending ? ['base.js',MIGRATION,'outra.js'] : ['base.js',MIGRATION],
    migration: { up: async ({ sequelize: db }) => {
      if (changes.badWrite) return db.query('UPDATE titulos_financeiros SET valor=0');
      await db.query('CREATE TABLE IF NOT EXISTS fiscal_nsdocs_captures (id VARCHAR(36))');
    } } };
  return { sequelize, dependencies, calls };
}
test('migration dedica uma estrutura e ledger; replay nao reinsere e lock e liberado', async () => {
  for (const applied of [false,true]) {
    const f = migrationFixture({applied}); const result = await applyOnConnection(f.sequelize, f.dependencies);
    assert.equal(result.applied_now, !applied); assert.equal(f.calls.filter(s=>s.startsWith('INSERT')).length, applied ? 0 : 1);
    assert(f.calls.at(-1).includes('RELEASE_LOCK'));
  }
});
test('TLS/UUID/pendencia alheia ou tentativa de DML impedem schema/ledger indevidos', async () => {
  for (const changes of [{noTls:true},{badDb:true},{otherPending:true},{badWrite:true}]) {
    const f = migrationFixture(changes); await assert.rejects(applyOnConnection(f.sequelize, f.dependencies));
    assert(!f.calls.some(s=>/^(INSERT|CREATE|UPDATE)/.test(s)));
  }
});
test('migration exige confirmacoes explicitas antes de conectar; zero rede real', async () => {
  const previous = process.env.CONFIRM_NSDOCS_DEV_SCHEMA;
  delete process.env.CONFIRM_NSDOCS_DEV_SCHEMA;
  try { await assert.rejects(migrateDev({ guard() {}, readDatabase() { throw Error('NAO_DEVERIA_CONECTAR'); } }),
    fails('NSDOCS_MIGRATION_EXIGE_BACKUP_DEV_E_CONFIRMACAO')); }
  finally { if (previous !== undefined) process.env.CONFIRM_NSDOCS_DEV_SCHEMA = previous; }
  assert.equal(network, 0);
});
