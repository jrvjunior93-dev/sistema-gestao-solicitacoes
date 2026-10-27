'use strict';
// Banco SQLite real em memoria, schema novo executado pelo proprio up; MySQL
// GET_LOCK/INFORMATION_SCHEMA/FOR UPDATE adaptados explicitamente no harness.
// Nao comprova comportamento de RDS/S3/NSDOCS reais: isso sera homologado no DEV.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { Sequelize, DataTypes } = require('sequelize');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { gzipSync } = require('node:zlib');
let realCalls = 0;
for (const [name, methods] of [['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:child_process', ['exec', 'execFile', 'spawn', 'spawnSync']]]) {
  for (const method of methods) require(name)[method] = () => { realCalls++; throw Error('IO_REAL_PROIBIDO'); };
}
global.fetch = () => { realCalls++; throw Error('IO_REAL_PROIBIDO'); };
const root = '../src/modules/fiscal/services/nsdocs/manual/';
const { captureManually, preflightCapture } = require(root + 'capture');
const { createRepository, MIGRATION } = require(root + 'repository');
const { storageConfig, createStorage } = require(root + 'storage');
const { ACCOUNT, ROLE, SESSION_NAME, SESSION_POLICY, createDevCredentialsProvider } = require(root + 'iam');
const { sha256, validateNfeXml, MAX_XML_BYTES } = require(root + 'xml');
const { requestXml, decodeXml } = require(root + 'transport');
const { normalizeResponse } = require(root + 'query');
const { validateQuery } = require(root + 'policy');
const cli = require('./nsdocsDevCapture');
const migration = require('../migrations/202610240001_fiscal_nsdocs_capturas');
const COMPANY = '11222333000181', ISSUER = '11444777000161', SECRET = 'FICTICIO_NAO_E_UMA_CHAVE_REAL';
const company = { id: 2, cnpj: COMPANY, name: 'Empresa ficticia', ativo: true };
// Nomes/ARNs de configuracao sao publicos; todos os transportes continuam ficticios.
const env = { NSDOCS_DEV_S3_BUCKET: 'fluxy-fiscal-dev', NSDOCS_PROD_S3_BUCKET: 'fluxy-fiscal-prod',
  NSDOCS_DEV_S3_OWNER: ACCOUNT, NSDOCS_DEV_S3_ROLE_ARN: ROLE,
  FISCAL_S3_BUCKET: 'fluxy-fiscal-dev', FISCAL_S3_REGION: 'us-east-2', FISCAL_S3_PREFIX: 'dev' };
const config = storageConfig(env);
const input = { companyCnpj: COMPANY, status: 'Pendente', startDate: '2026-10-01', endDate: '2026-10-31', limit: 5, offset: 0 };
function accessKey(number = 123) {
  const base = '322610' + ISSUER + '55' + '001' + String(number).padStart(9, '0') + '1' + '00000001';
  assert.equal(base.length, 43); let sum = 0, weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  return base + (sum % 11 < 2 ? 0 : 11 - sum % 11);
}
function row(number = 123) { return { id: String(number), empresa_cnpj: COMPANY, emitente_cnpj: ISSUER, emitente_nome: 'Fornecedor ficticio',
  destinatario_cnpj: COMPANY, destinatario_nome: company.name, numero: number, chave_acesso: accessKey(number),
  data_emissao: '20/10/2026', data_recebimento: '21/10/2026', valor: 'R$ 1.234,56', modelo: 'NF-e', situacao: 'Autorizado', status: 'Pendente' }; }
function doc(number = 123) { return normalizeResponse({ rows: [row(number)], total: 1 }, validateQuery(input, { companyCnpj: COMPANY }), company).documents[0]; }
function xml(document = doc()) { return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${document.access_key}" versao="4.00"><ide><mod>55</mod><nNF>${document.number}</nNF><dhEmi>2026-10-20T12:00:00-03:00</dhEmi></ide><emit><CNPJ>${ISSUER}</CNPJ><xNome>Ficticio</xNome></emit><dest><CNPJ>${COMPANY}</CNPJ></dest><total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${document.access_key}</chNFe></infProt></protNFe></nfeProc>`); }
const fails = code => error => error.code === code;

function tableSql(name, attributes) {
  const cols = Object.entries(attributes).map(([key, a]) => {
    const type = String(a.type); const integer = /INT|BOOL/.test(type);
    let sql = `"${key}" ${integer ? 'INTEGER' : 'TEXT'}`;
    if (a.primaryKey) sql += ' PRIMARY KEY' + (a.autoIncrement ? ' AUTOINCREMENT' : '');
    if (a.allowNull === false) sql += ' NOT NULL';
    if (a.unique) sql += ' UNIQUE';
    if (a.defaultValue !== undefined) {
      const value = a.defaultValue;
      if (typeof value === 'boolean' || typeof value === 'number') sql += ` DEFAULT ${Number(value)}`;
      else if (typeof value === 'string') sql += ` DEFAULT '${value.replaceAll("'", "''")}'`;
    }
    if (a.references) sql += ` REFERENCES "${a.references.model}"("${a.references.key}") ON DELETE ${a.onDelete || 'RESTRICT'}`;
    return sql;
  });
  return `CREATE TABLE "${name}" (${cols.join(',')})`;
}
async function database() {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  sql.exec('CREATE TABLE empresas_grupo(id INTEGER PRIMARY KEY, cnpj TEXT, ativo INTEGER); CREATE TABLE fiscal_companies(id INTEGER PRIMARY KEY, empresa_id INTEGER, cnpj TEXT, ativo INTEGER); CREATE TABLE schema_migrations(name TEXT PRIMARY KEY)');
  sql.prepare('INSERT INTO empresas_grupo VALUES (?, ?, ?)').run(2, COMPANY, 1);
  sql.prepare('INSERT INTO fiscal_companies VALUES (?, ?, ?, ?)').run(9, 2, COMPANY, 1);
  for (const [file, table] of [['FiscalDfeDocument', 'fiscal_dfe_documents'], ['FiscalDfeEvent', 'fiscal_dfe_events']]) {
    require('../src/modules/fiscal/models/' + file)({ define(_name, attrs) {
      sql.exec(tableSql(table, { ...attrs, createdAt: { type: DataTypes.DATE }, updatedAt: { type: DataTypes.DATE } }));
    } }, DataTypes);
  }
  const indices = table => sql.prepare(`PRAGMA index_list("${table}")`).all().flatMap(i => sql.prepare(`PRAGMA index_info("${i.name}")`).all().map((f, index) =>
    ({ TABLE_NAME: table, INDEX_NAME: i.name, NON_UNIQUE: i.unique ? 0 : 1, SEQ_IN_INDEX: index + 1, COLUMN_NAME: f.name })));
  const qi = {
    createTable: async (name, attrs) => sql.exec(tableSql(name, attrs)),
    showIndex: async table => indices(table).map(i => ({ unique: !i.NON_UNIQUE, fields: [{ attribute: i.COLUMN_NAME }] })),
    addIndex: async (table, fields, options) => sql.exec(`CREATE UNIQUE INDEX "${options.name}" ON "${table}" (${fields.join(',')})`)
  };
  await migration.up({ sequelize: { query: async (_s, { replacements }) => [[{ total: sql.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name=?").get(replacements[0]).n }]] }, queryInterface: qi, DataTypes });
  sql.prepare('INSERT INTO schema_migrations VALUES (?)').run(MIGRATION);
  let locked = false, failSql, failCommit = false;
  const trace = [];
  const db = {
    async execute(statement, args = []) {
      trace.push(statement);
      if (failSql && statement.includes(failSql)) throw Error('FALHA_SQL_FICTICIA');
      if (statement.includes('GET_LOCK')) { const acquired = locked ? 0 : 1; locked = true; return [[{ acquired }]]; }
      if (statement.includes('RELEASE_LOCK')) { locked = false; return [[{ released: 1 }]]; }
      if (statement.includes('information_schema.TABLES')) return [[...['fiscal_nsdocs_captures','fiscal_nsdocs_observations','fiscal_nsdocs_capture_events','fiscal_dfe_documents','fiscal_dfe_events','fiscal_companies'].map(TABLE_NAME => ({ TABLE_NAME, ENGINE: 'InnoDB' }))]];
      if (statement.includes('information_schema.STATISTICS')) return [[...indices('fiscal_nsdocs_captures'), ...indices('fiscal_nsdocs_observations'), ...indices('fiscal_dfe_documents')]];
      const query = sql.prepare(statement.replace(/ FOR UPDATE\b/g, ''));
      if (/^SELECT/.test(statement)) return [query.all(...args)];
      const result = query.run(...args); return [{ insertId: Number(result.lastInsertRowid), affectedRows: result.changes }];
    },
    async beginTransaction() { sql.exec('BEGIN IMMEDIATE'); },
    async commit() { sql.exec('COMMIT'); if (failCommit) { failCommit = false; throw Error('COMMIT_ACK_FICTICIO_PERDIDO'); } },
    async rollback() { if (sql.isTransaction) sql.exec('ROLLBACK'); }
  };
  return { sql, db, trace, fail: value => { failSql = value; }, loseCommit: () => { failCommit = true; }, close: () => sql.close() };
}
async function fixture(rows = [row()]) {
  const fixtureDb = await database(); const journals = []; const objects = new Map(); let listCalls = 0, xmlCalls = 0, storeCalls = 0;
  let failXml = false, lock = false;
  const storage = {
    async preflight() {}, close() {},
    async put(document, body) { storeCalls++; const hash = sha256(body), key = `${config.prefix}/${COMPANY}/nfe/${document.access_key}/${hash}.xml`;
      objects.set(key, body); return { bucket: config.bucket, key, hash }; }
  };
  const dependencies = { guard() {}, storageConfig: () => config, createStorage: () => storage,
    withDatabase: fn => fn(fixtureDb.db),
    store: { async withLock(fn) { if (lock) throw Error('LOCK'); lock = true; try { return await fn(); } finally { lock = false; } },
      loadCredentials: () => ({ companyId: 2, companyCnpj: COMPANY, apiKey: SECRET }),
      checkCooldown() {}, appendHistory: item => journals.push(item) },
    async list() { listCalls++; return { rows, total: rows.length }; },
    async xml(document) { xmlCalls++; if (failXml && document.number === '124') throw Error('erro com segredo ' + SECRET); return xml(document); }
  };
  const options = { company, input, captureId: randomUUID(), confirmed: true };
  return { ...fixtureDb, options, dependencies, storage, objects, journals,
    counts: () => ({ listCalls, xmlCalls, storeCalls }), setFailXml: value => { failXml = value; },
    capture: changes => captureManually({ ...options, ...changes }, dependencies) };
}

test('captura grava NF-e, XML e historico em transacoes; repetir mesmo lote nao faz NSDOCS', async t => {
  const f = await fixture(); t.after(f.close);
  const first = await f.capture(); assert.equal(first.persisted, true); assert.equal(first.xmls, 1);
  const repeated = await f.capture(); assert.equal(repeated.replayed, true); assert.equal(repeated.external_nsdocs_calls, 0);
  assert.deepEqual(f.counts(), { listCalls: 1, xmlCalls: 1, storeCalls: 1 });
  for (const table of ['fiscal_dfe_documents','fiscal_nsdocs_observations','fiscal_dfe_events']) assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1);
  assert(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_capture_events').get().n >= 5);
  assert(!JSON.stringify(f.sql.prepare('SELECT * FROM fiscal_nsdocs_captures').all()).includes(SECRET));
  assert(!f.trace.some(s => /titulos_financeiros|pedido_compras|financeiro_baixas|UPDATE fiscal_companies/i.test(s)));
});
test('nova captura da mesma NF-e preserva cadastro anterior, XML, estados e vinculos', async t => {
  const f = await fixture(); t.after(f.close); await f.capture();
  f.sql.exec("UPDATE fiscal_dfe_documents SET document_status='validated', manifestation_status='confirmacao_operacao', issuer_name='Nome conferido', xml_storage_key='dev/outro/original.xml', hash_xml='antigo'");
  const before = f.sql.prepare('SELECT * FROM fiscal_dfe_documents').all();
  await f.capture({ captureId: randomUUID() });
  assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_documents').all(), before);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_observations').get().n, 2);
});
test('retoma falha parcial sem refazer lista nem XML do documento concluido; erro nao vaza chave', async t => {
  const f = await fixture([row(), row(124)]); t.after(f.close); f.setFailXml(true);
  await assert.rejects(f.capture(), fails('NSDOCS_FALHA_SANITIZADA'));
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_dfe_documents').get().n, 1);
  f.setFailXml(false); const result = await f.capture(); assert.equal(result.resumed_documents, 1);
  assert.deepEqual(f.counts(), { listCalls: 1, xmlCalls: 3, storeCalls: 2 });
  assert(!JSON.stringify(f.sql.prepare('SELECT * FROM fiscal_nsdocs_capture_events').all()).includes(SECRET));
});
test('falha de historico reverte documento/observacao; objeto imutavel pode ser reaproveitado', async t => {
  const f = await fixture(); t.after(f.close); f.fail('INSERT INTO fiscal_dfe_events');
  await assert.rejects(f.capture());
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_dfe_documents').get().n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_observations').get().n, 0);
  assert.equal(f.objects.size, 1); f.fail(null); await f.capture(); assert.equal(f.objects.size, 1);
});
test('idempotencia divergente, empresa fiscal ausente/inativa e schema pendente impedem API', async t => {
  const f = await fixture(); t.after(f.close); await f.capture(); const counts = f.counts();
  await assert.rejects(f.capture({ input: { ...input, endDate: '2026-10-30' } }), fails('NSDOCS_IDEMPOTENCIA_DIVERGENTE'));
  assert.equal(f.sql.prepare('SELECT state FROM fiscal_nsdocs_captures').get().state, 'completed');
  f.sql.exec('UPDATE fiscal_companies SET ativo=0');
  await assert.rejects(f.capture({ captureId: randomUUID() }), fails('NSDOCS_EMPRESA_FISCAL_DEV_NAO_VINCULADA'));
  f.sql.exec('UPDATE fiscal_companies SET ativo=1; DELETE FROM schema_migrations');
  await assert.rejects(f.capture({ captureId: randomUUID() }), fails('NSDOCS_SCHEMA_CAPTURA_PENDENTE'));
  assert.deepEqual(f.counts(), counts);
});
test('chave de acesso de outra empresa nao e reatribuida; unique real e FK preservam integridade', async t => {
  const f = await fixture(); t.after(f.close); await f.capture();
  f.sql.exec('UPDATE fiscal_dfe_documents SET fiscal_company_id=88');
  await assert.rejects(f.capture({ captureId: randomUUID() }), fails('NSDOCS_NOTA_EXISTENTE_OUTRA_EMPRESA'));
  assert.equal(f.sql.prepare('SELECT fiscal_company_id FROM fiscal_dfe_documents').get().fiscal_company_id, 88);
  assert.throws(() => f.sql.prepare('INSERT INTO fiscal_nsdocs_observations (capture_id,fiscal_dfe_document_id,access_key,provider_id,snapshot_json,xml_bucket,xml_key,xml_hash,createdAt,updatedAt) SELECT capture_id,fiscal_dfe_document_id,access_key,provider_id,snapshot_json,xml_bucket,xml_key,xml_hash,createdAt,updatedAt FROM fiscal_nsdocs_observations').run(), /UNIQUE/);
  assert.throws(() => f.sql.prepare('DELETE FROM fiscal_nsdocs_captures').run(), /FOREIGN KEY/);
});
test('concorrencia recusa segundo comando antes da API; preflight nao grava', async t => {
  const f = await fixture(); t.after(f.close); const repo = createRepository(f.db); await repo.lock();
  await assert.rejects(f.capture(), fails('NSDOCS_CAPTURA_OCUPADA')); await repo.unlock();
  const result = await preflightCapture({ company }, f.dependencies); assert.equal(result.persisted, false);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_captures').get().n, 0);
  assert.equal(f.counts().listCalls, 0);
});
test('historico limitado e restrito a empresa; rollback de migration bloqueado', async t => {
  const f = await fixture(); t.after(f.close); await f.capture(); const repo = createRepository(f.db);
  const history = await repo.history(f.options.captureId, company); assert.equal(history.state, 'completed');
  assert(history.events.length); await assert.rejects(repo.history(f.options.captureId, { ...company, id: 7 }), fails('NSDOCS_CAPTURA_NAO_ENCONTRADA'));
  await assert.rejects(migration.down(), /preservar/);
});

test('XML valida modelo55, DV, chave, partes, numero, data e centavos; sem validar assinatura', () => {
  const d = doc(), good = xml(d); assert.equal(validateNfeXml(good, d).validation, 'identity_checked_signature_unverified');
  for (const [from, to] of [['1234.56','1234.57'],[COMPANY, ISSUER],['<mod>55','<mod>65'],['<nNF>123','<nNF>9'],['2026-10-20T','2026-10-19T'],['</NFe>',''],['<emit>','<emit><CNPJ>'+ISSUER+'</CNPJ>']]) {
    assert.throws(() => validateNfeXml(Buffer.from(good.toString().replace(from, to)), d));
  }
  for (const evil of ['<!DOCTYPE NFe [<!ENTITY a SYSTEM "file:///etc/passwd">]>'+good,
    good.toString().replace('<emit>', '<emit xmlns="urn:hostil">'), good.toString() + good.toString()]) assert.throws(() => validateNfeXml(Buffer.from(evil), d));
  assert.throws(() => validateNfeXml(Buffer.alloc(MAX_XML_BYTES + 1), d));
  assert.throws(() => validateNfeXml(Buffer.from([0xc3,0x28]), d));
  const echo = good.toString().replace('</infNFe>', '<infAdic><infCpl>&#70;' + SECRET.slice(1) + '</infCpl></infAdic></infNFe>');
  assert(!echo.includes(SECRET));
  assert.throws(() => validateNfeXml(Buffer.from(echo), d, SECRET), fails('NSDOCS_RESPOSTA_CONTEM_SEGREDO'));
  const badKey = { ...d, access_key: d.access_key.slice(0, -1) + ((Number(d.access_key.at(-1)) + 1) % 10) };
  assert.throws(() => validateNfeXml(Buffer.from(good.toString().replaceAll(d.access_key, badKey.access_key)), badKey), fails('NSDOCS_XML_CHAVE_INVALIDA'));
});
test('storage exige bucket DEV separado, dono, regiao/prefixo e nenhum endpoint customizado', () => {
  for (const changes of [{ NSDOCS_DEV_S3_BUCKET: undefined }, { NSDOCS_PROD_S3_BUCKET: env.NSDOCS_DEV_S3_BUCKET },
    { FISCAL_S3_BUCKET: 'fiscal-fixture-prod' }, { FISCAL_S3_REGION: 'us-east-1' }, { FISCAL_S3_PREFIX: 'prod' },
    { NSDOCS_DEV_S3_OWNER: 'errado' }, { AWS_ENDPOINT_URL: 'https://hostil' }, { NSDOCS_DEV_S3_ROLE_ARN: undefined },
    { NSDOCS_DEV_S3_ROLE_ARN: 'arn:aws:iam::992500432025:role/OutraRole' },
    { NSDOCS_DEV_S3_BUCKET: 'fluxy-fiscal-prod', FISCAL_S3_BUCKET: 'fluxy-fiscal-prod', NSDOCS_PROD_S3_BUCKET: 'outro-bucket' }]) assert.throws(() => storageConfig({ ...env, ...changes }));
});

function s3Fixture(changes = {}) {
  const calls = [], objects = new Map(); let puts = 0;
  const responses = { GetBucketLocationCommand: { LocationConstraint: 'us-east-2' },
    GetPublicAccessBlockCommand: { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } },
    GetBucketPolicyStatusCommand: { PolicyStatus: { IsPublic: false } },
    GetBucketOwnershipControlsCommand: { OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } },
    GetBucketVersioningCommand: { Status: 'Enabled' }, ...changes };
  const client = { async send(command) {
    const name = command.constructor.name, fields = command.input; calls.push({ name, fields });
    assert.equal(fields.Bucket, config.bucket); assert.equal(fields.ExpectedBucketOwner, config.owner);
    if (name === 'PutObjectCommand') {
      puts++; assert.equal(fields.IfNoneMatch, '*'); assert.equal(fields.ServerSideEncryption, 'AES256'); assert.equal(fields.ACL, undefined);
      if (objects.has(fields.Key)) throw { $metadata: { httpStatusCode: 412 } };
      objects.set(fields.Key, Buffer.from(fields.Body)); return {};
    }
    if (name === 'GetObjectCommand') return { Body: (async function* () { yield objects.get(fields.Key); })() };
    return responses[name];
  }, destroy() {} };
  return { storage: createStorage(config, client), calls, objects, puts: () => puts };
}
test('S3 privado/versionado: conditional put, checksum e bytes conferidos na repeticao', async () => {
  const f = s3Fixture(); await f.storage.preflight(); const d = doc(), body = xml(d);
  const first = await f.storage.put(d, body), second = await f.storage.put(d, body);
  assert.deepEqual(first, second); assert.equal(f.objects.size, 1); assert.equal(f.puts(), 2);
  f.objects.set(first.key, Buffer.from('adulterado'));
  await assert.rejects(f.storage.put(d, body), fails('NSDOCS_STORAGE_OBJETO_DIVERGENTE'));
  for (const changes of [{ GetBucketVersioningCommand: { Status: 'Suspended' } }, { GetBucketPolicyStatusCommand: { PolicyStatus: { IsPublic: true } } },
    { GetBucketLocationCommand: { LocationConstraint: 'us-east-1' } }, { GetPublicAccessBlockCommand: {} }, { GetBucketOwnershipControlsCommand: {} }]) {
    const denied = s3Fixture(changes); await assert.rejects(denied.storage.preflight()); assert.equal(denied.puts(), 0);
  }
});
test('XML GET e fixo, sem redirect, preserva status observado, TLS e segredo somente no header', async () => {
  const calls = []; const client = { request(url, options, callback) {
    calls.push({ url, options }); const req = new EventEmitter(); req.destroy = () => {}; req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'application/xml', 'content-encoding': 'gzip' }; res.destroy = () => {};
      callback(res); res.emit('data', gzipSync(xml())); res.emit('end');
    }); return req;
  } };
  const d = doc(), response = await requestXml(d, SECRET, client); assert.deepEqual(response, xml());
  assert.equal(calls[0].url.origin, 'https://api.nsdocs.com.br'); assert.equal(calls[0].url.searchParams.get('status'), 'Pendente');
  assert.equal(calls[0].options.rejectUnauthorized, true); assert.equal(calls[0].options.headers.Authorization, 'Bearer '+SECRET);
  assert(!calls[0].url.href.includes(SECRET));
  assert.throws(() => requestXml({ ...d, provider_id: '../malicioso' }, SECRET, client));
  assert.throws(() => decodeXml(gzipSync(Buffer.alloc(MAX_XML_BYTES+1)), 'gzip'));
});
test('CLI exige confirmacoes/UUID/filtros, limita5 e nao aceita chave em argv', async () => {
  const base = ['--empresa-id','2','--cnpj',COMPANY], args = [...base,'--capturar','--captura-id',randomUUID(),'--inicio','2026-10-01','--fim','2026-10-31','--status','Pendente','--confirmar-chamada-real','--confirmar-persistencia'];
  assert.equal(cli.parseOptions(args).input.limit, 5);
  assert.throws(() => cli.parseOptions(args.filter(a => a !== '--confirmar-persistencia')));
  assert.throws(() => cli.parseOptions([...args,'--quantidade','6']));
  assert.throws(() => cli.parseOptions([...args,'--api-key',SECRET]));
  let output, captured;
  await cli.main(args, { loadCompany: async () => company, capture: async o => { captured = o; return { fixture: true }; }, log: o => { output = o; } });
  assert(captured.confirmed); assert.deepEqual(output, { fixture: true });
});
test('defaults recusam rodar no computador local; zero rede/EC2/banco externo', async () => {
  await assert.rejects(captureManually({ company, input, captureId: randomUUID(), confirmed: true }), fails('NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_DEV'));
  assert.equal(realCalls, 0);
});

test('ACK de commit perdido na abertura: lote duravel e retomavel, sem duplicar', async t => {
  const f = await fixture(); t.after(f.close); f.loseCommit();
  await assert.rejects(f.capture()); assert.equal(f.counts().listCalls, 0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_captures').get().n, 1);
  await f.capture(); assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_dfe_documents').get().n, 1);
});
test('ACK perdido apos gravar documento e apos conclusao nao duplica XML/evento', async t => {
  const f = await fixture(); t.after(f.close);
  const originalPut = f.storage.put;
  f.storage.put = async (...args) => { const result = await originalPut(...args); f.loseCommit(); return result; };
  await assert.rejects(f.capture()); assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_observations').get().n, 1);
  f.storage.put = originalPut;
  const next = await f.capture(); assert.equal(next.resumed_documents, 1); assert.equal(f.counts().xmlCalls, 1);
  // Outra captura: perda de ACK somente no commit final.
  const originalRepository = f.dependencies.repository;
  f.dependencies.repository = db => { const repo = createRepository(db), complete = repo.complete;
    repo.complete = async (...args) => { f.loseCommit(); return complete(...args); }; return repo; };
  const captureId = randomUUID(); await assert.rejects(f.capture({ captureId }));
  f.dependencies.repository = originalRepository;
  const counts = f.counts(), replay = await f.capture({ captureId });
  assert.equal(replay.replayed, true); assert.deepEqual(f.counts(), counts);
});
test('retomada com XML pendente respeita cooldown; segredo e XML divergente nao sao gravados', async t => {
  const f = await fixture([row(), row(124)]); t.after(f.close); f.setFailXml(true);
  await assert.rejects(f.capture());
  const before = f.counts(); f.setFailXml(false);
  f.dependencies.store.checkCooldown = () => { throw Object.assign(Error(), { code: 'NSDOCS_AGUARDE_60_SEGUNDOS' }); };
  await assert.rejects(f.capture(), fails('NSDOCS_AGUARDE_60_SEGUNDOS')); assert.deepEqual(f.counts(), before);
  f.dependencies.store.checkCooldown = () => {};
  f.dependencies.xml = async () => Buffer.from(xml(doc(124)).toString().replace('1234.56','9999.99'));
  await assert.rejects(f.capture(), fails('NSDOCS_XML_DADOS_DIVERGENTES'));
  assert.equal(f.objects.size, 1);
  f.dependencies.xml = async () => Buffer.from(SECRET);
  await assert.rejects(f.capture(), fails('NSDOCS_RESPOSTA_CONTEM_SEGREDO')); assert.equal(f.objects.size, 1);
});
test('S3 falha antes da lista; aborta sem salvar XML; lote vazio nao comprova existencia de documentos', async t => {
  const f = await fixture([]); t.after(f.close);
  f.storage.preflight = async () => { throw Error('acesso negado ficticio'); };
  await assert.rejects(f.capture()); assert.equal(f.counts().listCalls, 0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_nsdocs_captures').get().n, 0);
  f.storage.preflight = async () => {};
  const empty = await f.capture(); assert.equal(empty.documents, 0); assert.equal(empty.xmls, 0);
  assert.equal(f.counts().xmlCalls, 0);
});
test('unico de captura/chave recusa intercalacao mesmo sem lock de arquivo; transaction rollback', async t => {
  const f = await fixture(); t.after(f.close); await f.capture();
  const observation = f.sql.prepare('SELECT * FROM fiscal_nsdocs_observations').get();
  assert.throws(() => f.sql.prepare('INSERT INTO fiscal_dfe_documents (fiscal_company_id,document_type,access_key,document_status,manifestation_status,currency,source,is_duplicate) VALUES (9,\'nfe\',?,\'xml_downloaded\',\'pending\',\'BRL\',\'nsdocs_v2_manual\',0)').run(observation.access_key), /UNIQUE/);
  const repo = createRepository(f.db);
  await repo.saveDocument({ id: f.options.captureId, company, fiscalCompanyId: 9, doc: doc(),
    xml: { bucket: config.bucket, key: observation.xml_key, hash: observation.xml_hash } });
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM fiscal_dfe_events').get().n, 1);
});

test('migration gera DDL MySQL/InnoDB com FKs e UNIQUE sem DML, sem conectar', async () => {
  const sequelize = new Sequelize('fixture', 'fixture', 'fixture', { dialect: 'mysql', logging: false });
  const generator = sequelize.getQueryInterface().queryGenerator, statements = [];
  await migration.up({ sequelize: { query: async () => [[{ total: 0 }]] }, DataTypes,
    queryInterface: {
      async createTable(table, attrs, options) {
        const normalized = Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, sequelize.normalizeAttribute(value)]));
        statements.push(generator.createTableQuery(table, generator.attributesToSQL(normalized, { table, context: 'createTable' }), options));
      },
      async showIndex() { return []; },
      async addIndex(table, fields, options) { statements.push(generator.addIndexQuery(table, fields, options)); }
    }
  });
  assert.equal(statements.length, 4);
  const { assertStructuralSql } = require(root + 'migrationDev');
  for (const statement of statements) assertStructuralSql(statement);
  assert(statements.slice(0, 3).every(s => /ENGINE=InnoDB/.test(s) && /FOREIGN KEY/.test(s)));
  assert(statements.every(s => !/JSONTYPE/.test(s)));
  assert(/UNIQUE/.test(statements[3]) && /capture_id/.test(statements[3]) && /access_key/.test(statements[3]));
  assert(!statements.some(s => /INSERT INTO|DELETE FROM|UPDATE .* SET|TRUNCATE/i.test(s)));
  await assert.rejects(migration.up({ sequelize: { query: async () => [[{ total: 1 }]] }, DataTypes,
    queryInterface: { describeTable: async () => ({ id: {} }) } }), /incompativel/);
  await sequelize.close();
});

function stsFixture(changes = {}) {
  let calls = 0, destroyed = 0;
  const now = Date.parse('2026-10-24T12:00:00Z');
  const response = { AssumedRoleUser: { Arn: `arn:aws:sts::${ACCOUNT}:assumed-role/FluxyNsdocsFiscalDev/${SESSION_NAME}` },
    Credentials: { AccessKeyId: 'ASIAFICTICIO00000000', SecretAccessKey: 'SEGREDO_TEMPORARIO_FICTICIO',
      SessionToken: 'TOKEN_TEMPORARIO_FICTICIO', Expiration: new Date(now + 900000) }, ...changes.response };
  const client = { async send(command, options) {
    calls++; assert.equal(command.constructor.name, 'AssumeRoleCommand');
    assert.equal(command.input.RoleArn, ROLE); assert.equal(command.input.RoleSessionName, SESSION_NAME);
    assert.equal(command.input.DurationSeconds, 900); assert.deepEqual(JSON.parse(command.input.Policy), SESSION_POLICY);
    assert(options.abortSignal);
    if (changes.fail) throw Error('ERRO_BRUTO_COM_SEGREDO_FICTICIO');
    return response;
  }, destroy() { destroyed++; } };
  const source = { AWS_ACCESS_KEY_ID: 'FONTE_FICTICIA_ID', AWS_SECRET_ACCESS_KEY: 'FONTE_FICTICIA_SECRET' };
  const provider = createDevCredentialsProvider(config, changes.source || source, { guard() {}, client, clock: () => now });
  return { provider, calls: () => calls, destroyed: () => destroyed };
}
test('STS assume role unica/temporaria por captura; origem nao e usada como credencial S3', async () => {
  const before = { ...process.env }, f = stsFixture();
  const [first, second] = await Promise.all([f.provider(), f.provider()]);
  assert.strictEqual(first, second); assert.equal(first.accessKeyId, 'ASIAFICTICIO00000000');
  assert.equal(first.sessionToken, 'TOKEN_TEMPORARIO_FICTICIO');
  assert.equal(f.calls(), 1); assert.equal(f.destroyed(), 1); assert.deepEqual({ ...process.env }, before);
});
test('STS falho nao faz retry/fallback; sessao errada, semtoken/expirada ou origem ausente recusadas', async () => {
  const denied = stsFixture({ fail: true });
  await assert.rejects(denied.provider(), fails('NSDOCS_IAM_ASSUME_ROLE_DEV_RECUSADO'));
  await assert.rejects(denied.provider(), fails('NSDOCS_IAM_ASSUME_ROLE_DEV_RECUSADO'));
  assert.equal(denied.calls(), 1); assert.equal(denied.destroyed(), 1);
  for (const response of [{ AssumedRoleUser: { Arn: 'arn:aws:iam::992500432025:user/admin-jose' } },
    { Credentials: { AccessKeyId: 'x', SecretAccessKey: 'y', SessionToken: '', Expiration: new Date('2099-01-01') } },
    { Credentials: { AccessKeyId: 'x', SecretAccessKey: 'y', SessionToken: 'z', Expiration: new Date('2000-01-01') } }]) {
    const f = stsFixture({ response }); await assert.rejects(f.provider(), fails('NSDOCS_IAM_SESSAO_DEV_INVALIDA')); assert.equal(f.destroyed(), 1);
  }
  const noSource = stsFixture({ source: {} });
  await assert.rejects(noSource.provider(), fails('NSDOCS_IAM_CREDENCIAL_ORIGEM_AUSENTE')); assert.equal(noSource.calls(), 0);
});
test('policy/trust dedicada: prefixoempresaDEV,HTTPS,owner; outrosrecursosS3 negados explicitamente', () => {
  const trust = require(root + 'iam-dev-trust.json');
  assert.equal(trust.Statement.length, 1);
  assert.equal(trust.Statement[0].Principal.AWS, `arn:aws:iam::${ACCOUNT}:user/admin-jose`);
  assert.equal(trust.Statement[0].Action, 'sts:AssumeRole');
  const allow = SESSION_POLICY.Statement.filter(s => s.Effect === 'Allow');
  assert.equal(allow.length, 2);
  assert.deepEqual(allow[1].Action, ['s3:GetObject','s3:PutObject']);
  assert.equal(allow[1].Resource, 'arn:aws:s3:::fluxy-fiscal-dev/dev/nsdocs/27123008000100/nfe/*');
  assert(allow.every(s => s.Condition.Bool['aws:SecureTransport'] === 'true' && s.Condition.StringEquals['s3:ResourceAccount'] === ACCOUNT));
  assert(!JSON.stringify(SESSION_POLICY).includes('fluxy-fiscal-prod'));
  const deny = SESSION_POLICY.Statement.find(s => s.Effect === 'Deny');
  assert.equal(deny.Action, 's3:*'); assert.equal(deny.NotResource.length, 2);
  assert(!allow.some(s => s.Action.some(a => /Delete|PutBucket|PutObjectAcl|ListAll/.test(a))));
  assert(JSON.stringify(SESSION_POLICY).length <= 2048);
});
test('SDK STS instalado serializa AssumeRole e sessao real em transporte simulado, sem rede', async () => {
  const { STSClient } = require('@aws-sdk/nested-clients/sts');
  const { HttpResponse } = require('@smithy/protocol-http');
  let requests = 0;
  const now = Date.parse('2026-10-24T12:00:00Z');
  const client = new STSClient({ region: 'us-east-2', endpoint: 'https://sts.us-east-2.amazonaws.com', maxAttempts: 1,
    credentials: { accessKeyId: 'FONTE_FICTICIA_ID', secretAccessKey: 'FONTE_FICTICIA_SECRET' },
    requestHandler: { async handle(request) {
      requests++; assert.equal(request.hostname, 'sts.us-east-2.amazonaws.com'); assert.equal(request.protocol, 'https:');
      const body = new URLSearchParams(request.body);
      assert.equal(body.get('Action'), 'AssumeRole'); assert.equal(body.get('RoleArn'), ROLE);
      assert.deepEqual(JSON.parse(body.get('Policy')), SESSION_POLICY);
      const xml = `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleResult><AssumedRoleUser><Arn>arn:aws:sts::${ACCOUNT}:assumed-role/FluxyNsdocsFiscalDev/${SESSION_NAME}</Arn><AssumedRoleId>FICTICIO</AssumedRoleId></AssumedRoleUser><Credentials><AccessKeyId>ASIAFICTICIO</AccessKeyId><SecretAccessKey>SEGREDOFICTICIO</SecretAccessKey><SessionToken>TOKENFICTICIO</SessionToken><Expiration>2026-10-24T12:15:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>`;
      return { response: new HttpResponse({ statusCode: 200, headers: { 'content-type': 'text/xml' }, body: Buffer.from(xml) }) };
    }, destroy() {} }
  });
  const provider = createDevCredentialsProvider(config, { AWS_ACCESS_KEY_ID:'FONTE_FICTICIA_ID', AWS_SECRET_ACCESS_KEY:'FONTE_FICTICIA_SECRET' },
    { guard() {}, client, clock: () => now });
  assert.equal((await provider()).accessKeyId, 'ASIAFICTICIO'); assert.equal(requests, 1); assert.equal(realCalls, 0);
});
