const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validatePresignQuery } = require('../src/validators/securityValidators');
const fileNames = require('../src/utils/fileName');
let assertions = 0;
function load(relative, mocks, extra = {}) {
  const module = { exports: {} };
  const file = path.resolve(__dirname, '../src', relative);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, Buffer, URL, console: { error() {} },
    require: id => mocks[id] || {}, ...extra }, { filename: file });
  return module.exports;
}
const commands = [], signed = [];
const s3 = load('services/s3.js', {
  fs, path, crypto: require('node:crypto'), '../utils/fileName': fileNames,
  '@aws-sdk/client-s3': { S3Client: class {}, GetObjectCommand: class { constructor(input) { this.input = input; commands.push(input); } } },
  '@aws-sdk/s3-request-presigner': { getSignedUrl: async (_client, command, options) => {
    signed.push({ command: command.input, options }); return 'https://storage.invalid/signed';
  } }
}, { process: { env: { AWS_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'fixture',
  AWS_SECRET_ACCESS_KEY: 'fixture', AWS_S3_BUCKET: 'fixture-bucket' } } });
let access = true, exists = true, historyAllowed = true, historyExists = true;
const object = { kind: 'SOLICITACAO_ANEXO', record: { id: 7, solicitacao_id: 42,
  caminho_arquivo: 'https://fixture-bucket.s3.us-east-2.amazonaws.com/anexos/arquivo.pdf',
  nome_original: 'Medição "setembro".pdf' } };
const issued = [];
const controller = load('controllers/AnexoController.js', {
  '../models': { Historico: { findByPk: async () => historyExists ? {
    id: 3, solicitacao_id: 42, metadata: { caminho: object.record.caminho_arquivo }
  } : null } },
  '../services/s3': { getPresignedUrl: async (...args) => { issued.push(args); return s3.getPresignedUrl(...args); } },
  '../services/fileAccessService': { resolveRegisteredFileResource: async () => exists ? object : null,
    getRegisteredFilePath: target => target.record.caminho_arquivo,
    assertRegisteredFileAccess: async () => ({ allowed: access, status: 403, error: 'Sem permissao' }),
    canAccessSolicitacaoFile: async () => ({ allowed: historyAllowed, status: 403 }) },
  '../services/securityLogService': { registrarEventoSeguranca: async () => {} },
  '../services/anexoHistoricoService': { arquivoHistoricoRemovido: async () => !exists }
});
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
async function presign(query) { const res = response(); await controller.presign({ query, user: { id: 9 } }, res); return res; }
(async () => {
  for (const download of ['true', '', ['1'], { valor: '1' }, '2'])
    assert.throws(() => validatePresignQuery({ url: 'arquivo.pdf', download }));
  assert.throws(() => validatePresignQuery({ url: 'a', key: 'b', download: '1' }));
  assert.throws(() => validatePresignQuery({ url: 'a', download: '1', nome: 'nao-permitido.pdf' }));
  assert.equal(validatePresignQuery({ url: 'a', download: '1' }).download, true);
  assert.equal(validatePresignQuery({ url: 'a', download: '0' }).download, false); assertions++;

  const query = validatePresignQuery({ url: object.record.caminho_arquivo, download: '1' });
  assert.equal((await presign(query)).code, 200);
  assert.equal(issued.at(-1)[1], 300, 'TTL original de 5min');
  assert.equal(issued.at(-1)[2].strict, true);
  assert.equal(signed.at(-1).command.Bucket, 'fixture-bucket');
  assert.equal(signed.at(-1).command.Key, 'anexos/arquivo.pdf');
  assert.equal(signed.at(-1).options.expiresIn, 300);
  assert.equal(signed.at(-1).command.ResponseContentDisposition,
    fileNames.attachmentContentDisposition(object.record.nome_original));
  assert.equal(signed.at(-1).command.ResponseContentType, undefined); assertions++;

  const before = issued.length;
  access = false; assert.equal((await presign(query)).code, 403);
  assert.equal(issued.length, before, 'Nao assinar antes de autorizar');
  access = true; exists = false; assert.equal((await presign(query)).code, 404);
  assert.equal(issued.length, before, 'Removido/nao registrado nao pode assinar'); assertions++;
  exists = true;
  historyAllowed = false; assert.equal((await presign({ historico_id: 3, download: true })).code, 403);
  assert.equal(issued.length, before);
  historyAllowed = true; historyExists = false;
  assert.equal((await presign({ historico_id: 3, download: true })).code, 404); assertions++;
  historyExists = true;
  assert.equal((await presign({ historico_id: 3, download: true })).code, 200);
  assert(signed.at(-1).command.ResponseContentDisposition.startsWith('attachment;')); assertions++;

  await presign(validatePresignQuery({ url: object.record.caminho_arquivo }));
  assert.equal(signed.at(-1).command.ResponseContentDisposition, undefined, 'Preview continua inline');
  await presign(validatePresignQuery({ url: object.record.caminho_arquivo, download: '0' }));
  assert.equal(signed.at(-1).command.ResponseContentDisposition, undefined); assertions++;

  await s3.getPresignedUrl('anexos/pagina.svg', 300, { strict: true });
  assert(signed.at(-1).command.ResponseContentDisposition.startsWith('attachment;'));
  assert.equal(signed.at(-1).command.ResponseContentType, 'application/octet-stream'); assertions++;
  const commandCount = commands.length;
  await assert.rejects(s3.getPresignedUrl('https://evil.invalid/arquivo.pdf', 300, { strict: true, download: true }));
  assert.equal(commands.length, commandCount);
  assert.equal(await s3.getPresignedUrl('/uploads/anexos/a.pdf', 300, { strict: true, download: true }), '/uploads/anexos/a.pdf'); assertions++;

  for (const name of ['a\r\nSet-Cookie: segredo.pdf', 'x"; filename="evil.pdf', '../../anexo\\x.pdf', 'Medição ç.pdf', '']) {
    const header = fileNames.attachmentContentDisposition(name);
    assert(!/[\r\n\u0000-\u001f\u007f]/.test(header));
    assert(/^attachment; filename="[^"\\]*"; filename\*=UTF-8''/.test(header));
  }
  assert(fileNames.attachmentContentDisposition('Medição ç.pdf').includes('Medi%C3%A7%C3%A3o%20%C3%A7.pdf')); assertions++;

  // SDK real com credenciais ficticias explicitas: assinatura e computada
  // localmente, sem chamar S3, buscar perfil/IMDS ou ler .env da aplicacao.
  const sdk = require('@aws-sdk/client-s3');
  const signer = require('@aws-sdk/s3-request-presigner');
  const realS3 = load('services/s3.js', {
    fs, path, crypto: require('node:crypto'), '../utils/fileName': fileNames,
    '@aws-sdk/client-s3': sdk, '@aws-sdk/s3-request-presigner': signer
  }, { process: { env: { AWS_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'AKIAFIXTUREONLY',
    AWS_SECRET_ACCESS_KEY: 'fixture-not-a-real-secret', AWS_S3_BUCKET: 'fixture-bucket' } } });
  const signedUrl = new URL(await realS3.getPresignedUrl('anexos/medicao%20setembro.pdf', 300,
    { strict: true, download: true, downloadName: 'Medição setembro.pdf' }));
  assert.equal(signedUrl.hostname, 'fixture-bucket.s3.us-east-2.amazonaws.com');
  assert.equal(signedUrl.searchParams.get('X-Amz-Expires'), '300');
  assert.match(signedUrl.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
  assert.equal(signedUrl.searchParams.get('response-content-disposition'),
    fileNames.attachmentContentDisposition('Medição setembro.pdf')); assertions++;
  console.log(`${assertions} cenarios de download/assinatura/ACL aprovados. Sem banco, AWS ou .env.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
