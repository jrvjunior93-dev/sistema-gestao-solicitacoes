'use strict';

// Testes offline: nao carrega app/server, .env, models, banco ou SDK de storage.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');

let networkCalls = 0;
for (const [name, functions] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:dns', ['lookup', 'resolve']], ['node:child_process', ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync']]
]) {
  for (const fn of functions) require(name)[fn] = () => { networkCalls++; throw Error('IO_EXTERNO_PROIBIDO'); };
}
global.fetch = () => { networkCalls++; throw Error('HTTP_PROIBIDO'); };

const root = path.resolve(__dirname, '../src');
const moduleRoot = path.join(root, 'modules/fiscal/services/nsdocs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { BASE_URL, FIXTURE_COMPANY_CNPJ: COMPANY, getConfig, getDiagnostics } = require(path.join(moduleRoot, 'config'));
const { buildListRequest } = require(path.join(moduleRoot, 'contract'));
const { MAX_BODY_BYTES, decodeListBody, normalizePage, moneyCents } = require(path.join(moduleRoot, 'normalize'));
const { fixtureDocuments } = require(path.join(moduleRoot, 'fixtures/documents'));
const { createNsdocsV2Connector } = require(path.join(moduleRoot, 'connector'));
const fixtureEnv = {
  DEPLOYMENT_ENV: 'development', NODE_ENV: 'test', FISCAL_MODULE_ENABLED: 'true',
  NSDOCS_V2_ENABLED: 'true', NSDOCS_V2_MODE: 'fixture', NSDOCS_V2_FIXTURES_ENABLED: 'true'
};
const options = { companyCnpj: COMPANY, status: 'Pendente', startDate: '2026-10-01', endDate: '2026-10-31' };
const request = (changes = {}) => buildListRequest({ ...options, ...changes }, COMPANY);
const failure = code => error => error.code === code && error.message === code;

test('desligado por padrao; segredo nao e lido, usado ou devolvido', async () => {
  const env = {};
  Object.defineProperty(env, 'NSDOCS_V2_API_KEY', { get() { throw Error('SEGREDO_NAO_DEVE_SER_LIDO'); } });
  assert.equal(getConfig(env).enabled, false);
  const connector = createNsdocsV2Connector({ env });
  await assert.rejects(connector.listDocuments(options), failure('NSDOCS_CONECTOR_DESLIGADO'));
  assert.equal(connector.diagnostics().real_calls_available, false);
  assert.equal(JSON.stringify(getDiagnostics({ ...fixtureEnv, NSDOCS_V2_API_KEY: 'SENTINELA_SECRETA' })).includes('SENTINELA'), false);
});

test('fixtures exigem ativacoes explicitas e ambiente development; real sempre indisponivel', () => {
  for (const changes of [
    { DEPLOYMENT_ENV: 'production' }, { DEPLOYMENT_ENV: '' },
    { NODE_ENV: 'production' }, { NSDOCS_V2_FIXTURES_ENABLED: 'false' },
    { FISCAL_MODULE_ENABLED: 'false' }, { NSDOCS_V2_MODE: 'real' },
    { NSDOCS_V2_MODE: 'https://outro.invalid' }, { NSDOCS_V2_ENABLED: 'sim' }
  ]) {
    const env = { ...fixtureEnv, ...changes };
    assert.throws(() => createNsdocsV2Connector({ env }));
    assert.equal(getDiagnostics(env).enabled, false);
    assert.equal(getDiagnostics(env).configuration_valid, false);
  }
  assert.equal(getConfig(fixtureEnv).mode, 'fixture');
});

test('contrato GET fixo, sem credencial, status explicito e limites oficiais', () => {
  const descriptor = request({ limit: 100, offset: 1900 });
  const url = new URL(descriptor.url);
  assert.equal(url.origin + url.pathname, `${BASE_URL}/documentos`);
  assert.equal(descriptor.method, 'GET');
  assert.equal(descriptor.headers['Empresa-Cnpj'], COMPANY);
  assert.equal(Object.hasOwn(descriptor.headers, 'Authorization'), false);
  assert.equal(url.searchParams.get('data_recebimento'), '01/10/2026 - 31/10/2026');
  assert.equal(url.searchParams.get('status'), 'Pendente');
  for (const changes of [
    { status: undefined }, { status: 'Todos' }, { limit: 101 }, { limit: 0 },
    { limit: '10' }, { offset: -1 }, { offset: 1901 }, { offset: 0.1 },
    { startDate: '2026-02-30' }, { startDate: '2026-11-01' },
    { companyCnpj: '11111111111111' }, { companyCnpj: '../empresa' },
    { url: 'https://outro.invalid' }, { method: 'PUT' }, { headers: {} },
    { token: 'SENTINELA' }, { utilizado: true }
  ]) assert.throws(() => request(changes));
});

test('consulta ficticia paginada, valores exatos e status fiscais independentes', async () => {
  const connector = createNsdocsV2Connector({ env: fixtureEnv });
  const pending = await connector.listDocuments({ ...options, limit: 1 });
  assert.equal(pending.documents.length, 1);
  assert.equal(pending.documents[0].total_cents, 123456);
  assert.equal(pending.documents[0].number, '1001');
  assert.equal(pending.documents[0].provider_usage_status, 'Pendente');
  assert.equal(pending.documents[0].fiscal_status, 'Autorizado');
  assert.equal(pending.documents[0].validation_state, 'unverified_metadata');
  assert.equal(pending.persisted, false);
  assert.equal(pending.window_complete, true);
  const imported = await connector.listDocuments({ ...options, status: 'Importado' });
  assert.equal(imported.documents[0].fiscal_status, 'Cancelado');
  assert.equal(imported.documents[0].provider_usage_status, 'Importado');
  assert.deepEqual(await connector.listDocuments(options), await connector.listDocuments(options));
  const empty = await connector.listDocuments({ ...options, startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.equal(empty.documents.length, 0);
  assert.equal(empty.total, 0);
});

test('compressao gzip, deflate e sem header; limites, JSON e UTF-8 invalidos', () => {
  const body = Buffer.from(JSON.stringify(fixtureDocuments()));
  for (const [encoding, data] of [
    ['gzip', zlib.gzipSync(body)], ['deflate', zlib.deflateSync(body)],
    [undefined, zlib.gzipSync(body)], ['identity', body]
  ]) assert.deepEqual(decodeListBody(data, encoding), fixtureDocuments());
  for (const [data, encoding] of [
    [Buffer.alloc(MAX_BODY_BYTES + 1), 'identity'],
    [zlib.gzipSync(Buffer.alloc(MAX_BODY_BYTES + 1)), 'gzip'],
    [Buffer.from('['), 'identity'], [Buffer.from('{"erro":"SENTINELA"}'), 'identity'],
    [Buffer.from([0xff]), 'identity'], [body, 'br'], [body, undefined],
    [Buffer.from(JSON.stringify(Array(101).fill({}))), 'identity']
  ]) assert.throws(() => decodeListBody(data, encoding), error => error.message.startsWith('NSDOCS_') && !error.message.includes('SENTINELA'));
});

test('normalizacao rejeita escopo, datas, ids e valores ambiguos sem expor payload', () => {
  const row = fixtureDocuments()[0];
  for (const changes of [
    { empresa_cnpj: '11111111111111' }, { destinatario_cnpj: '22222222222222' },
    { data_emissao: '31/02/2026' }, { data_recebimento: '01/09/2026' },
    { status: 'Importado' }, { chave_acesso: ['1'.repeat(44)] },
    { chave_acesso: '123' }, { id: '../path' }, { numero: 1.5 },
    { valor: '1.234' }, { valor: 'R$ -1,00' }, { valor: 'R$ 1.23,45' },
    { valor: '999999999999999999999,00' }, { emitente_nome: '\nSENTINELA' }
  ]) assert.throws(() => normalizePage([{ ...row, ...changes }], request(), 1),
    error => error.message.startsWith('NSDOCS_') && !error.message.includes('SENTINELA'));
  assert.equal(moneyCents('R$ 0,01'), 1);
  assert.equal(moneyCents('1234,56'), 123456);
  assert.equal(moneyCents('0,00'), 0);
});

test('repeticao identica nao duplica; conflitos nao apagam historico; modelos futuros separados', () => {
  const row = fixtureDocuments()[0];
  const result = normalizePage([row, { ...row }], request(), 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.documents.length, 1);
  assert.throws(() => normalizePage([row, { ...row, situacao: 'Cancelado' }], request(), 2), failure('NSDOCS_DUPLICIDADE_CONFLITANTE'));
  assert.throws(() => normalizePage([row, { ...row, chave_acesso: '3'.repeat(44) }], request(), 2), failure('NSDOCS_ID_CONFLITANTE'));
  for (const modelo of ['NFS-e', 'CT-e']) {
    const result = normalizePage([{ ...row, modelo }], request(), 1);
    assert.equal(result.documents.length, 0);
    assert.equal(result.unsupported[0].reason, 'MODELO_NAO_IMPLEMENTADO');
  }
});

test('normalizacao nao modifica dados de origem nem registros historicos; diagnostico e snapshot', async () => {
  const rows = fixtureDocuments().filter(row => row.status === 'Pendente');
  const before = JSON.stringify(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  normalizePage(rows, request(), 1);
  assert.equal(JSON.stringify(rows), before);
  const env = { ...fixtureEnv };
  const connector = createNsdocsV2Connector({ env });
  env.NSDOCS_V2_ENABLED = 'false';
  connector.diagnostics().supported_models.push('CT-e');
  assert.equal(connector.diagnostics().enabled, true);
  assert.deepEqual(connector.diagnostics().supported_models, ['NF-e']);
  assert.equal((await connector.listDocuments(options)).documents.length, 1);
});

test('paginacao nunca oculta teto de 2000 ou declara conclusao com pagina inconsistente', () => {
  const row = fixtureDocuments()[0];
  const first = normalizePage([row], request({ limit: 1 }), 3);
  assert.equal(first.next_offset, 1);
  assert.equal(first.window_complete, false);
  for (const total of [2000, 3000]) {
    const end = normalizePage([row], request({ limit: 1, offset: 1999 }), total);
    assert.equal(end.partition_required, true);
    assert.equal(end.next_offset, null);
    assert.equal(end.window_complete, false);
  }
  assert.equal(normalizePage([row], request(), 3).partition_required, true);
  for (const total of [-1, 0, '1', NaN]) assert.throws(() => normalizePage([row], request(), total));
  assert.throws(() => normalizePage([], request(), 1));
});

function isolated(file, dependencies, env = {}) {
  const context = { module: { exports: {} }, process: { env }, console, Date,
    require(name) {
      assert(Object.hasOwn(dependencies, name), `Dependencia nao isolada: ${name}`);
      return dependencies[name];
    } };
  vm.runInNewContext(read(file), context, { filename: file });
  return context.module.exports;
}

test('rota real de diagnostico preserva autenticacao, ACL fiscal e auditoria de negacao', async () => {
  const unexpectedDb = () => { throw Error('BANCO_REAL_PROIBIDO'); };
  const auth = isolated('services/authorizationService.js', {
    '../models': { ConfiguracaoSistema: { findOne: async () => null }, Setor: { findByPk: unexpectedDb }, UsuarioObra: {} },
    './setorCapabilityService': { userHasSetorCapability: async () => false },
    '../constants/rhDpPermissions': require('../src/constants/rhDpPermissions'),
    '../constants/moduloPermissoes': require('../src/constants/moduloPermissoes')
  });
  const denied = [];
  const permit = isolated('middlewares/permissions.js', {
    '../services/authorizationService': auth,
    '../services/securityLogService': { registrarEventoSeguranca: async event => denied.push(event) }
  });
  const env = { ...fixtureEnv, NSDOCS_V2_API_KEY: 'SENTINELA_SECRETA' };
  const controller = isolated('modules/fiscal/controllers/FiscalNsdocsController.js', {
    '../services/nsdocs/config': { getDiagnostics: () => getDiagnostics(env) }
  });
  const captured = new Map();
  const noop = (req, res, next) => next();
  const dummyController = new Proxy({}, { get: () => noop });
  const dependencies = {
    express: { Router: () => Object.fromEntries(['get', 'post', 'patch'].map(method =>
      [method, (url, ...handlers) => captured.set(`${method}:${url}`, handlers)])) },
    '../../../middlewares/permissions': permit,
    '../../../middlewares/validation': { validateRequest: () => noop },
    '../../../validators/securityValidators': { validateNumericIdParam: () => noop },
    '../../../services/authorizationService': auth,
    '../controllers/FiscalNsdocsController': controller,
    '../validators/fiscalValidators': new Proxy({}, { get: () => noop }),
    '../config/uploadFiscalFile': { single: () => noop }, '../config/uploadFiscalXml': { fields: () => noop }
  };
  for (const name of ['FiscalDashboardController', 'FiscalAccountingBatchController', 'FiscalCertificateController',
    'FiscalCompanyController', 'FiscalDivergenceController', 'FiscalDocumentController', 'FiscalSyncLogController']) {
    dependencies[`../controllers/${name}`] = dummyController;
  }
  isolated('modules/fiscal/routes/index.js', dependencies);
  const routes = [...captured.keys()].filter(key => key.includes('nsdocs'));
  assert.deepEqual(routes, ['get:/diagnostics/nsdocs']);
  const handlers = captured.get(routes[0]);
  async function call(user) {
    const req = { user, originalUrl: '/api/fiscal/diagnostics/nsdocs' };
    const res = { code: 200, headers: {}, status(value) { this.code = value; return this; },
      set(key, value) { this.headers[key] = value; return this; }, json(value) { this.body = value; return this; } };
    async function run(index) { if (index < handlers.length) await handlers[index](req, res, () => run(index + 1)); }
    await run(0);
    assert.equal(JSON.stringify(res).includes('SENTINELA'), false);
    return res;
  }
  assert.equal((await call(null)).code, 401);
  const user = { id: 10, perfil: 'USUARIO', areas_permissoes_configuradas: true, areas_permissoes: ['fiscal.document.view'] };
  assert.equal((await call(user)).code, 403);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].recursoTipo, 'FISCAL_CONFIG');
  for (const allowed of [
    { ...user, areas_permissoes: ['fiscal.config.manage'] },
    { id: 11, perfil: 'SUPERADMIN' }, { id: 12, perfil: 'ADMINISTRADOR' }
  ]) {
    const result = await call(allowed);
    assert.equal(result.code, 200);
    assert.equal(result.body.mode, 'fixture');
    assert.equal(result.body.credentials_used, false);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('grafo do conector aceita apenas modulos puros locais e builtins; zero chamadas externas', () => {
  const files = ['config.js', 'contract.js', 'normalize.js', 'connector.js', 'fixtures/documents.js'];
  for (const file of files) {
    const absolute = path.join(moduleRoot, file);
    const localRequire = createRequire(absolute);
    for (const match of fs.readFileSync(absolute, 'utf8').matchAll(/require\('([^']+)'\)/g)) {
      if (match[1].startsWith('node:')) assert(['node:zlib', 'node:util'].includes(match[1]));
      else assert(files.map(f => path.join(moduleRoot, f)).includes(localRequire.resolve(match[1])));
    }
  }
  assert.equal(networkCalls, 0);
});
