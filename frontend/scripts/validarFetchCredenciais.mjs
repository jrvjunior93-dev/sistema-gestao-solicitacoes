import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { isTrustedApiTarget } from '../src/utils/requestTarget.js';

const source = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
let checks = 0;
function harness(apiUrl = '/api') {
  const calls = [], events = [], storage = new Map();
  let next = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  const window = { location: { href: 'https://app.fluxy.test/solicitacoes/42' },
    fetch: async (input, options) => { calls.push({ input, options }); return next; },
    dispatchEvent: event => events.push(event) };
  const sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key) };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) } }).code, {
    module, exports: module.exports, window, sessionStorage,
    require: () => ({ isTrustedApiTarget }),
    document: { cookie: 'fluxy_csrf=csrf-legitimo' }, URL, Request, Headers, Response,
    CustomEvent: class { constructor(type) { this.type = type; } }
  });
  module.exports.setAuthToken('sessao-fluxy');
  module.exports.installFetchSecurityDefaults();
  return { api: module.exports, window, calls, events,
    response: r => { next = r; } };
}
async function scenario(name, callback) { await callback(); checks++; console.log(`OK ${name}`); }

await scenario('origem exata, fronteira do caminho, protocolo, porta e URL relativa', async () => {
  const h = harness('https://api.fluxy.test/api');
  for (const input of ['https://api.fluxy.test/api', 'https://api.fluxy.test/api/titulos',
    new URL('https://api.fluxy.test/api/medicoes'), new Request('https://api.fluxy.test/api/anexos'),
    'https://api.fluxy.test/uploads/a.pdf']) assert(h.api.isApiRequest(input));
  for (const input of ['https://api.fluxy.test.evil.test/api/titulos',
    'https://api.fluxy.test@evil.test/api/titulos', 'https://u:p@api.fluxy.test/api/titulos',
    'http://api.fluxy.test/api', 'https://api.fluxy.test:444/api',
    'https://api.fluxy.test/apimalicioso', 'https://api.fluxy.test/api/../../arquivo',
    'https://api.fluxy.test/arquivos', '/api/titulos', 'javascript:alert(1)', 'data:abc',
    '//evil.test/api', 'https://[invalido']) assert(!h.api.isApiRequest(input), String(input));
  assert(harness().api.isApiRequest('/api/titulos'));
  assert(harness().api.isApiRequest('/uploads/a.pdf'));
});
await scenario('API mantem sessao, CSRF, auditoria, body e signal', async () => {
  const h = harness(), abort = new AbortController();
  const body = JSON.stringify({ valor: 10 });
  await h.window.fetch('/api/medicoes', { method: 'POST', body, signal: abort.signal,
    headers: { 'Content-Type': 'application/json' } });
  const { options } = h.calls.at(-1);
  assert.equal(options.headers.get('Authorization'), 'Bearer sessao-fluxy');
  assert.equal(options.headers.get('X-CSRF-Token'), 'csrf-legitimo');
  assert(options.headers.has('X-Audit-Session-Id'));
  assert.equal(options.credentials, 'include'); assert.equal(options.redirect, 'error');
  assert.equal(options.body, body); assert.equal(options.signal, abort.signal);
});
await scenario('sessao somente cookie continua habilitada e logout nao deixa Bearer', async () => {
  const h = harness('https://api.fluxy.test/api');
  h.api.clearAuthToken();
  await h.window.fetch('https://api.fluxy.test/api/auth/me');
  assert.equal(h.calls.at(-1).options.credentials, 'include');
  assert.equal(h.calls.at(-1).options.headers.get('Authorization'), null);
  await h.window.fetch('https://api.fluxy.test/uploads/anexo.pdf');
  assert.equal(h.calls.at(-1).options.credentials, 'include');
});
await scenario('API absoluta em app nativo e URL codificada nao confundem a origem', async () => {
  assert(isTrustedApiTarget('https://api.fluxy.test/api/auth/me', 'https://api.fluxy.test/api', 'capacitor://localhost'));
  assert(!isTrustedApiTarget('https://evil.test/?next=https://api.fluxy.test/api', 'https://api.fluxy.test/api', 'capacitor://localhost'));
  assert(!isTrustedApiTarget('https://api.fluxy.test/api%2fmalicioso', 'https://api.fluxy.test/api', 'capacitor://localhost'));
});
await scenario('S3 nao recebe credenciais nem headers Fluxy e preserva assinatura', async () => {
  const h = harness();
  const signed = 'https://bucket.s3.us-east-2.amazonaws.com/a%20b.pdf?X-Amz-Signature=a%2Bb%2Fc&x=1';
  const original = new Headers({ ...h.api.authHeaders(), 'X-Audit-Session-Id': 'audit-secreto',
    'Cookie': 'fluxy_auth=segredo', 'Range': 'bytes=0-99' });
  await h.window.fetch(signed, { credentials: 'include', headers: original });
  const call = h.calls.at(-1);
  assert.equal(call.input, signed); assert.equal(call.options.credentials, 'omit');
  for (const name of ['Authorization', 'X-CSRF-Token', 'X-Audit-Session-Id', 'Cookie'])
    assert(!call.options.headers.has(name), name);
  assert.equal(call.options.headers.get('Range'), 'bytes=0-99');
  assert(original.has('Authorization'), 'Nao mutar headers do chamador');
});
await scenario('Request externo mantem objeto/body/signal, remove inclusive auth explicita', async () => {
  const h = harness();
  const request = new Request('https://terceiro.test/api/financeiro/caixas/1', {
    method: 'POST', body: 'texto', credentials: 'include', headers: {
      Authorization: 'Bearer externo', 'X-CSRF-Token': 'segredo', 'X-Audit-Session-Id': 'segredo',
      'Content-Type': 'text/plain' }
  });
  await h.window.fetch(request);
  const call = h.calls.at(-1);
  assert.equal(call.input, request); assert.equal(request.bodyUsed, false);
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.headers.get('Content-Type'), 'text/plain');
  assert.equal(call.options.headers.get('Authorization'), null); assert.equal(h.events.length, 0);
});
await scenario('Request da API preserva omit, headers explicitos e override em init', async () => {
  const h = harness();
  const request = new Request('https://app.fluxy.test/api/teste', { method: 'POST', credentials: 'omit',
    headers: { Authorization: 'Bearer explicito', 'X-CSRF-Token': 'csrf-explicito' }, body: 'body' });
  await h.window.fetch(request);
  assert.equal(h.calls.at(-1).options.credentials, 'omit');
  assert.equal(h.calls.at(-1).options.headers.get('Authorization'), 'Bearer explicito');
  assert.equal(h.calls.at(-1).options.headers.get('X-CSRF-Token'), 'csrf-explicito');
  await h.window.fetch(request, { credentials: 'include', headers: [['X-Teste', '1']], redirect: 'follow' });
  assert.equal(h.calls.at(-1).options.credentials, 'include');
  assert.equal(h.calls.at(-1).options.redirect, 'error');
  assert.equal(h.calls.at(-1).options.headers.get('X-Teste'), '1');
});
await scenario('resposta externa nao troca CSRF nem dispara eventos de negocio', async () => {
  const h = harness();
  h.response(new Response(JSON.stringify({ codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE' }),
    { status: 423, headers: { 'X-CSRF-Token': 'csrf-atacante' } }));
  await h.window.fetch('https://evil.test/api/teste');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.api.authHeaders()['X-CSRF-Token'], 'csrf-legitimo');
  assert.equal(h.events.length, 0);
  h.response(new Response('{}', { headers: { 'X-CSRF-Token': 'csrf-novo-api' } }));
  await h.window.fetch('/api/auth/me');
  assert.equal(h.api.authHeaders()['X-CSRF-Token'], 'csrf-novo-api');
});
await scenario('API mantem eventos 423 e eventos de escritas, instalacao idempotente', async () => {
  const h = harness(), original = h.window.fetch;
  h.api.installFetchSecurityDefaults(); assert.equal(h.window.fetch, original);
  h.response(new Response(JSON.stringify({ codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE' }), { status: 423 }));
  await h.window.fetch('/api/financeiro/caixas/1');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.events.at(-1).type, 'fluxy:controle-diario-caixa');
  h.response(new Response('{}'));
  await h.window.fetch('/api/pedidos-compra/1/entregas', { method: 'POST' });
  assert.equal(h.events.at(-1).type, 'fluxy:prazos-operacionais');
  await h.window.fetch('/api/financeiro/caixas/1', { redirect: 'manual' });
  assert.equal(h.calls.at(-1).options.redirect, 'manual');
});
console.log(`${checks} cenarios de isolamento HTTP aprovados. Sem rede, banco ou AWS.`);
