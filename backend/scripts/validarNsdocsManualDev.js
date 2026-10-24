'use strict';
// Sem .env, banco, PM2, arquivo de chave real ou rede. Fronteiras ficticias.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const zlib = require('node:zlib');
let realCalls = 0;
require('node:https').request = () => { realCalls++; throw Error('REDE_REAL_PROIBIDA'); };
global.fetch = () => { realCalls++; throw Error('REDE_REAL_PROIBIDA'); };
const root = path.resolve(__dirname, '../src/modules/fiscal/services/nsdocs/manual');
const policy = require(`${root}/policy`), store = require(`${root}/privateStore`);
const { requestDocuments } = require(`${root}/transport`);
const { queryManually } = require(`${root}/query`);
const cli = require('./nsdocsDevManual');
const { buildListRequest } = require(`${root}/../contract`);
const { readHiddenKey } = require(`${root}/hiddenPrompt`);
const { getRdsSsl, CA_SHA256 } = require(`${root}/rdsTls`);
const rdsCaBundle = require(`${root}/rds-ca-us-east-2.json`);
const CNPJ = '11222333000181', OTHER = '11444777000161', KEY = 'CHAVE_FICTICIA_SEM_VALOR_20261024';
const company = { id: 7, cnpj: CNPJ, name: 'Empresa ficticia DEV', ativo: true };
const credentials = () => ({ version: 1, environment: 'development', companyId: 7, companyCnpj: CNPJ, apiKey: KEY });
const input = { companyCnpj: CNPJ, status: 'Pendente', startDate: '2026-10-01', endDate: '2026-10-31', limit: 10, offset: 0 };
const args = ['--empresa-id', '7', '--cnpj', CNPJ];
const queryArgs = [...args, '--consultar', '--inicio', input.startDate, '--fim', input.endDate,
  '--status', input.status, '--confirmar-chamada-real'];
const row = () => ({ id: '900001', empresa_cnpj: '11.222.333/0001-81', emitente_cnpj: OTHER,
  emitente_nome: 'Fornecedor ficticio', destinatario_cnpj: CNPJ, destinatario_nome: company.name,
  numero: 123, chave_acesso: '1'.repeat(44), data_emissao: '20/10/2026', data_recebimento: '21/10/2026',
  valor: 'R$ 1.234,56', modelo: 'NF-e', situacao: 'Autorizado', status: 'Pendente' });
const fails = code => error => error.code === code;

test('politica impede main/producao, Node antigo, TLS inseguro, flags e limites', () => {
  const valid = { platform: 'linux', uid: 1000, cwd: policy.DEV_BACKEND, branch: 'refactor/frontend',
    executable: policy.DEV_NODE, version: 'v24.22.1', env: { deploymentEnvironment: 'development', port: 8001,
      dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', dbName: 'gestao_solicitacoes', dbSslCaFile: '/fake/ca' } };
  policy.validateRuntime(valid);
  for (const changes of [{ branch: 'main' }, { uid: 0 }, { cwd: '/producao/backend' }, { version: 'v24.13.0' },
    { env: { ...valid.env, port: 8000 } }, { env: { ...valid.env, dbName: 'outro_banco' } }]) {
    assert.throws(() => policy.validateRuntime({ ...valid, ...changes }));
  }
  for (const env of [{ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, { NSDOCS_V2_ENABLED: 'true' }, { NSDOCS_V2_FIXTURES_ENABLED: 'true' }]) {
    assert.throws(() => policy.validateFlags(env));
  }
  for (const changes of [{ limit: 21 }, { startDate: '2026-09-01' }, { companyCnpj: OTHER }, { method: 'PUT' }]) {
    assert.throws(() => policy.validateQuery({ ...input, ...changes }, credentials()));
  }
  assert.throws(() => policy.companyCnpj('00000000000000'));
});
test('CA AWS publica pinada independente da CA global; rejeita adulteracao/expiracao sem downgrade', () => {
  const ssl = getRdsSsl();
  assert.equal(ssl.ca, rdsCaBundle.pem);
  assert.equal(ssl.rejectUnauthorized, true); assert.equal(ssl.verifyIdentity, true);
  assert.equal(rdsCaBundle.sha256, CA_SHA256);
  for (const change of [{ region: 'us-east-1' }, { sha256: '0'.repeat(64) },
    { pem: rdsCaBundle.pem + 'alterado' }, { pem: '-----BEGIN PRIVATE KEY-----' }]) {
    assert.throws(() => getRdsSsl({ ...rdsCaBundle, ...change }), fails('NSDOCS_CA_RDS_INVALIDA'));
  }
  assert.throws(() => getRdsSsl(rdsCaBundle, Date.parse('2500-01-01T00:00:00Z')), fails('NSDOCS_CA_RDS_INVALIDA'));
});

function memoryFiles() {
  const files = new Map(), fds = new Map(); let next = 1;
  const stat = item => ({ uid: item.uid ?? 1000, mode: item.mode, nlink: item.nlink ?? 1,
    size: Buffer.byteLength(item.data || ''), isFile: () => !item.dir && !item.link,
    isDirectory: () => Boolean(item.dir), isSymbolicLink: () => Boolean(item.link) });
  const io = {
    existsSync: file => files.has(file),
    lstatSync(file) { assert(files.has(file)); return stat(files.get(file)); }, realpathSync: file => file,
    mkdirSync(file, options) { files.set(file, { dir: true, mode: options.mode, data: '' }); },
    openSync(file, flags, mode) {
      if (files.has(file) && flags & fs.constants.O_EXCL) throw Object.assign(Error('existe'), { code: 'EEXIST' });
      if (!files.has(file) && !(flags & fs.constants.O_CREAT)) throw Object.assign(Error('ausente'), { code: 'ENOENT' });
      if (!files.has(file)) files.set(file, { data: '', mode });
      if (files.get(file).link) throw Error('symlink recusado');
      fds.set(next, { file, flags }); return next++;
    },
    closeSync(fd) { fds.delete(fd); }, fsyncSync() {},
    fstatSync(fd) { return stat(files.get(fds.get(fd).file)); },
    readFileSync(fd) { return files.get(fds.get(fd).file).data; },
    writeFileSync(fd, data) {
      const { file, flags } = fds.get(fd), item = files.get(file);
      item.data = flags & fs.constants.O_APPEND ? item.data + data : data;
    },
    unlinkSync(file) { files.delete(file); }
  };
  return { io, files, fds };
}
test('chave fora do checkout, modo600/uid1000; nao sobrescreve nem aceita arquivo/link inseguro', () => {
  const { io, files, fds } = memoryFiles();
  store.saveCredentials({ companyId: 7, companyCnpj: CNPJ, apiKey: KEY }, io);
  assert.deepEqual(store.loadCredentials(io), credentials());
  assert.equal(files.get(policy.PRIVATE_DIR).mode, 0o700);
  assert.equal(files.get(policy.CREDENTIAL_FILE).mode, 0o600);
  assert.equal(policy.CREDENTIAL_FILE.includes('/backend'), false);
  assert.throws(() => store.saveCredentials({ companyId: 7, companyCnpj: CNPJ, apiKey: KEY }, io), fails('NSDOCS_CREDENCIAL_JA_EXISTE'));
  const original = { ...files.get(policy.CREDENTIAL_FILE) };
  for (const changes of [{ mode: 0o644 }, { uid: 0 }, { nlink: 2 }, { link: true }]) {
    files.set(policy.CREDENTIAL_FILE, { ...original, ...changes });
    assert.throws(() => store.loadCredentials(io));
    assert.equal(fds.size, 0);
  }
  assert.throws(() => store.parseCredentials(JSON.stringify({ ...credentials(), environment: 'production' })));
  assert.throws(() => store.parseCredentials(JSON.stringify({ ...credentials(), apiKey: 'key\r\nheader' })));
});
test('lock exclusivo, historico sem chave e intervalo de60segundos; libera apos falha', async () => {
  const { io, files } = memoryFiles(); store.ensureDirectory(io);
  await assert.rejects(store.withLock(async () => { await store.withLock(async () => {}, io); }, io));
  assert.equal(files.has(policy.LOCK_FILE), false);
  store.appendHistory({ at: 100000, requestId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12), companyId: 7, outcome: 'NSDOCS_CONSULTA_INICIADA' }, io);
  assert.throws(() => store.checkCooldown(159999, io), fails('NSDOCS_AGUARDE_60_SEGUNDOS'));
  store.checkCooldown(160000, io);
  assert.equal(files.get(policy.HISTORY_FILE).mode, 0o600);
  assert.equal(files.get(policy.HISTORY_FILE).data.includes(KEY), false);
  assert.throws(() => store.appendHistory({ at: 1, apiKey: KEY }, io));
});

function httpFixture({ status = 200, rows = [row()], encoding = 'gzip', contentType = 'application/json; charset=utf-8', total = '1',
  raw, error = false, wait = false } = {}) {
  const calls = [];
  const body = raw || (encoding === 'deflate' ? zlib.deflateSync(Buffer.from(JSON.stringify(rows))) : zlib.gzipSync(Buffer.from(JSON.stringify(rows))));
  const client = { request(url, options, callback) {
    calls.push({ url, options });
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => { if (wait) return; queueMicrotask(() => {
      if (error) return req.emit('error', Error('Bearer ' + KEY));
      const res = new EventEmitter(); res.statusCode = status; res.destroy = () => {};
      res.headers = { 'content-type': contentType, 'x-total-registros': total };
      if (encoding !== null) res.headers['content-encoding'] = encoding;
      callback(res); res.emit('data', body); res.emit('end');
    }); };
    return req;
  } };
  return { client, calls };
}
test('HTTPS GET origem fixa, TLS e Bearer somente no header; gzip/deflate/sem header', async () => {
  for (const encoding of ['gzip', 'deflate', null]) {
    const fake = httpFixture({ encoding });
    const result = await requestDocuments(buildListRequest(input, CNPJ), KEY, fake.client);
    assert.equal(result.rows.length, 1);
    const { url, options } = fake.calls[0];
    assert.equal(url.origin, 'https://api.nsdocs.com.br'); assert.equal(url.pathname, '/v2/documentos');
    assert.equal(url.href.includes(KEY), false);
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(options.headers['Empresa-Cnpj'], CNPJ);
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
    assert.equal(options.method, 'GET'); assert.equal(fake.calls.length, 1);
  }
  for (const url of ['http://api.nsdocs.com.br/v2/documentos', 'https://localhost/v2/documentos',
    'https://api.nsdocs.com.br/v2/eventos', 'https://user@api.nsdocs.com.br/v2/documentos']) {
    assert.throws(() => requestDocuments({ url, method: 'GET' }, KEY, httpFixture().client));
  }
});
test('redirect,401/403/429/202 e rede nao vazam erros/segredo nem repetem chamada', async () => {
  for (const status of [202, 301, 302, 400, 401, 403, 429, 500]) {
    const fake = httpFixture({ status, raw: Buffer.from('Bearer ' + KEY) });
    await assert.rejects(requestDocuments(buildListRequest(input, CNPJ), KEY, fake.client),
      error => error.code.startsWith('NSDOCS_') && !error.message.includes(KEY));
    assert.equal(fake.calls.length, 1);
  }
  const fake = httpFixture({ error: true });
  await assert.rejects(requestDocuments(buildListRequest(input, CNPJ), KEY, fake.client), fails('NSDOCS_REDE_INDISPONIVEL'));
});
test('resposta malformada/excessiva/eco da chave recusada antes de entregar dados', async () => {
  for (const settings of [{ contentType: 'text/html' }, { total: undefined }, { total: '-1' },
    { rows: [{ ...row(), emitente_nome: KEY }] }, { raw: Buffer.alloc(1024 * 1024 + 1) },
    { raw: zlib.gzipSync(Buffer.alloc(1024 * 1024 + 1)) }, { raw: Buffer.from('segredo ' + KEY) }]) {
    // undefined aciona default em destructuring; usar null para header ausente.
    const fake = httpFixture(settings.total === undefined && Object.hasOwn(settings, 'total') ? { ...settings, total: null } : settings);
    await assert.rejects(requestDocuments(buildListRequest(input, CNPJ), KEY, fake.client),
      error => !error.message.includes(KEY));
  }
});
test('protege tambem segredo com escape JSON, header injetado e entrada cancelada', async () => {
  const key = 'SEGREDO_FICTICIO_COM_"ASPAS"';
  const fake = httpFixture({ rows: [{ ...row(), emitente_nome: key }] });
  await assert.rejects(requestDocuments(buildListRequest(input, CNPJ), key, fake.client), fails('NSDOCS_RESPOSTA_CONTEM_SEGREDO'));
  assert.throws(() => policy.validKey(KEY + '\r\nCookie: vazamento'));
  const terminalInput = new PassThrough(), terminalOutput = new PassThrough();
  terminalInput.isTTY = terminalOutput.isTTY = true; terminalInput.setRawMode = () => {};
  const pending = readHiddenKey({ input: terminalInput, output: terminalOutput });
  terminalInput.write('\x03'); await assert.rejects(pending, fails('NSDOCS_ENTRADA_CANCELADA'));
  terminalInput.end(); terminalOutput.end();
});
test('timeout absoluto mesmo sem resposta; nada de retentativa', async () => {
  let fire, cleared = false;
  const fake = httpFixture({ wait: true });
  const context = { module: { exports: {} }, URL, Buffer,
    setTimeout: fn => { fire = fn; return 1; }, clearTimeout: () => { cleared = true; },
    require(name) { if (name === 'node:https') return fake.client;
      if (name === './policy') return policy;
      if (name === '../normalize') return require(`${root}/../normalize`);
      throw Error('Dependencia inesperada'); } };
  vm.runInNewContext(fs.readFileSync(`${root}/transport.js`, 'utf8'), context);
  const promise = context.module.exports.requestDocuments(buildListRequest(input, CNPJ), KEY);
  fire(); await assert.rejects(promise, fails('NSDOCS_TIMEOUT'));
  assert.equal(cleared, true); assert.equal(fake.calls.length, 1);
});
test('cancelamento aborta a unica requisicao sem esperar timeout ou repetir', async () => {
  const fake = httpFixture({ wait: true }), controller = new AbortController();
  const pending = requestDocuments(buildListRequest(input, CNPJ), KEY, fake.client, controller.signal);
  controller.abort();
  await assert.rejects(pending, fails('NSDOCS_CONSULTA_CANCELADA'));
  assert.equal(fake.calls.length, 1);
});

function serviceDependencies(rows = [row()], total = rows.length) {
  const events = []; let sends = 0;
  const dependencies = { guard() {}, clock: () => 200000,
    store: { withLock: async fn => fn(), loadCredentials: credentials, checkCooldown() {}, appendHistory: event => events.push(event) },
    send: async (request, token) => { sends++; assert.equal(token, KEY); return { rows, total }; }
  };
  return { dependencies, events, get sends() { return sends; } };
}
test('consulta manual confere CNPJ/cadastro e preserva documento sem gravar financeiro', async () => {
  const opaqueId = 'a4c739bf0f6f4dd9b26de837fa034812';
  const fake = serviceDependencies([{ ...row(), id: opaqueId }]);
  const result = await queryManually({ input, company, confirmed: true }, fake.dependencies);
  assert.equal(fake.sends, 1); assert.equal(result.persisted, false); assert.equal(result.real_calls, true);
  assert.equal(result.company_verified_in_response, true);
  assert.equal(result.documents[0].source_mode, 'manual');
  assert.equal(result.documents[0].total_cents, 123456);
  assert.equal(result.documents[0].provider_id, opaqueId);
  assert.equal(JSON.stringify(fake.events).includes(KEY), false);
  assert.equal(fake.events.at(-1).outcome, 'NSDOCS_CONSULTA_CONCLUIDA');
});
test('empresa divergente/inativa e falta de confirmacao impedem API; vazio nao comprova empresa', async () => {
  for (const data of [{ company: { ...company, cnpj: OTHER } }, { company: { ...company, ativo: false } }, { confirmed: false }]) {
    const fake = serviceDependencies();
    await assert.rejects(queryManually({ input, company, confirmed: true, ...data }, fake.dependencies));
    assert.equal(fake.sends, 0);
  }
  const fake = serviceDependencies([]);
  const result = await queryManually({ input, company, confirmed: true }, fake.dependencies);
  assert.equal(result.company_verified_in_response, false);
  const foreign = serviceDependencies([{ ...row(), empresa_cnpj: OTHER }]);
  await assert.rejects(queryManually({ input, company, confirmed: true }, foreign.dependencies), fails('NSDOCS_EMPRESA_FORA_DO_ESCOPO'));
});
test('erro bruto de transporte vira historico/saida fixa sem eco; guard local barra execucao indevida', async () => {
  const fake = serviceDependencies(); fake.dependencies.send = async () => { throw Error(KEY); };
  await assert.rejects(queryManually({ input, company, confirmed: true }, fake.dependencies), fails('NSDOCS_FALHA_SANITIZADA'));
  assert.equal(JSON.stringify(fake.events).includes(KEY), false);
  await assert.rejects(queryManually({ input, company, confirmed: true }), fails('NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_DEV'));
});

test('CLI: chave nao e argumento; configure/conferir nao fazem API e ocultam segredo', async () => {
  assert.throws(() => cli.parseOptions([...args, '--configurar', '--chave', KEY]), fails('NSDOCS_ARGUMENTOS_INVALIDOS'));
  assert.throws(() => cli.parseOptions(queryArgs.filter(arg => arg !== '--confirmar-chamada-real')));
  let prompted = 0, saved = 0, calls = 0; const output = [];
  const dependencies = { loadCompany: async () => company, prompt: async () => { prompted++; return KEY; },
    store: { saveCredentials(value) { assert.equal(value.apiKey, KEY); saved++; }, loadCredentials: credentials },
    query: async () => { calls++; }, log: value => output.push(value) };
  await cli.main([...args, '--configurar'], dependencies);
  await cli.main([...args, '--conferir'], dependencies);
  assert.equal(prompted, 1); assert.equal(saved, 1); assert.equal(calls, 0);
  assert.equal(JSON.stringify(output).includes(KEY), false);
  await assert.rejects(cli.main([...args, '--configurar'], { ...dependencies, loadCompany: async () => { throw Error('empresa'); } }));
  assert.equal(prompted, 1);
});
test('listar empresas e somente consulta local, sem arquivo de segredo ou NSDOCS', async () => {
  const output = [];
  await cli.main(['--listar-empresas'], {
    listCompanies: async () => [company], log: value => output.push(value),
    loadCompany: async () => { throw Error('Nao usar cadastro individual'); },
    query: async () => { throw Error('Nao chamar provedor'); }, prompt: async () => { throw Error('Nao pedir chave'); }
  });
  assert.equal(output[0].external_calls, 0);
  assert.throws(() => cli.parseOptions(['--listar-empresas', '--cnpj', CNPJ]));
});
test('CLI consulta exibe resumo sem documentos por padrao; previa explicita e limitada', async () => {
  const fake = serviceDependencies(), output = [];
  const dependencies = { loadCompany: async () => company,
    query: params => queryManually(params, fake.dependencies), log: value => output.push(value) };
  await cli.main(queryArgs, dependencies);
  assert.equal(output[0].document_preview, undefined);
  await cli.main([...queryArgs, '--mostrar-documentos'], dependencies);
  assert.equal(output[1].document_preview.length, 1);
  assert.equal(JSON.stringify(output).includes(KEY), false);
});
test('prompt TTY nao ecoa chave nem mantem historico; recusa pipes', async () => {
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = true; output.isTTY = true; input.setRawMode = () => {};
  let printed = ''; output.on('data', data => { printed += data; });
  const promise = readHiddenKey({ input, output });
  input.write(KEY + '\n');
  assert.equal(await promise, KEY);
  assert.equal(printed.includes(KEY), false);
  input.end(); output.end();
  await assert.rejects(readHiddenKey({ input: { isTTY: false }, output: { isTTY: false } }));
});

test('runtime SQL real em VM: identidade, TLS, cadastro ativo e rollback sem escrita', async () => {
  const statements = []; let closed = false, badIdentity = false, emptyCipher = false;
  const env = { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    dbName: 'gestao_solicitacoes', dbSslCaFile: '', dbPort: 3306, dbUser: 'fake', dbPassword: 'fake' };
  const db = { query: async sql => { statements.push(sql); return sql.startsWith('SELECT')
    ? [[{ uuid: badIdentity ? 'banco-errado' : '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' }]]
    : sql.startsWith('SHOW') ? [[{ Variable_name: 'Ssl_cipher', Value: emptyCipher ? '' : 'TLS_FICTICIO' }]] : []; },
    execute: async (sql, params) => { statements.push(sql); assert.equal(params[0], 7); return [[{ ...company, razao_social: company.name }]]; },
    rollback: async () => statements.push('ROLLBACK'), end: async () => { closed = true; } };
  const context = { module: { exports: {} }, process: { platform: 'linux', version: 'v24.22.1', getuid: () => 1000,
    cwd: () => policy.DEV_BACKEND, env: {} }, require(name) {
      if (name === 'node:fs') return { realpathSync: value => value, readlinkSync: () => policy.DEV_NODE,
        readFileSync: () => { throw Error('Nao ler CA global'); } };
      if (name === 'node:child_process') return { spawnSync: () => ({ status: 0, stdout: 'refactor/frontend' }) };
      if (name === './policy') return policy;
      if (name === './rdsTls') return { getRdsSsl };
      if (name.endsWith('/config/env')) return { env, validateRequiredEnv() {} };
      if (name === 'mysql2/promise') return { createConnection: async options => {
        assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.ssl.verifyIdentity, true);
        assert.equal(options.ssl.ca, rdsCaBundle.pem); return db;
      } };
      throw Error('Dependencia nao isolada');
    } };
  vm.runInNewContext(fs.readFileSync(`${root}/runtime.js`, 'utf8'), context);
  assert.equal((await context.module.exports.loadDevCompany(7, CNPJ)).cnpj, CNPJ);
  assert.equal(statements[0], 'START TRANSACTION READ ONLY');
  assert.equal(statements.at(-1), 'ROLLBACK'); assert.equal(closed, true);
  assert(statements.every(sql => /^(SELECT|SHOW SESSION STATUS|START TRANSACTION READ ONLY|ROLLBACK)/.test(sql)));
  badIdentity = true; statements.length = 0; closed = false;
  await assert.rejects(context.module.exports.loadDevCompany(7, CNPJ), fails('NSDOCS_BANCO_DEV_DIVERGENTE'));
  assert.equal(statements.some(sql => sql.includes('empresas_grupo')), false);
  assert.equal(closed, true); assert.equal(statements.at(-1), 'ROLLBACK');
  badIdentity = false; emptyCipher = true; statements.length = 0; closed = false;
  await assert.rejects(context.module.exports.loadDevCompany(7, CNPJ), fails('NSDOCS_SESSAO_MYSQL_SEM_TLS'));
  assert.equal(statements.some(sql => sql.includes('empresas_grupo')), false);
  assert.equal(closed, true); assert.equal(statements.at(-1), 'ROLLBACK');
});
test('nenhuma rede real acionada pela bateria ficticia', () => { assert.equal(realCalls, 0); });
