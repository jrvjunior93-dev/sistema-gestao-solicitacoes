// Browser real, API/storage locais: nenhum acesso a AWS, EC2 ou banco.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const require = createRequire(import.meta.url);
const { attachmentContentDisposition } = require('../../backend/src/utils/fileName.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/download-medicao-credenciais');
await fs.mkdir(output, { recursive: true });
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const name = 'Medição setembro.pdf';
const receivedApi = [], receivedStorage = [], errors = [], unexpected = [];
let mode = 'normal', signature = 0, uiOrigin;
const storage = http.createServer((req, res) => {
  receivedStorage.push({ url: req.url, method: req.method, headers: req.headers });
  const u = new URL(req.url, 'http://storage.test');
  if (u.pathname === '/externo') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'X-CSRF-Token');
    res.setHeader('X-CSRF-Token', 'csrf-injetado');
    res.setHeader('Content-Type', 'application/json');
    return res.end('{}');
  }
  if (u.pathname !== '/medicao.pdf') {
    unexpected.push(`storage ${req.method} ${u.pathname}`); res.statusCode = 404; return res.end();
  }
  res.setHeader('Content-Type', 'application/pdf');
  if (u.searchParams.has('response-content-disposition'))
    res.setHeader('Content-Disposition', u.searchParams.get('response-content-disposition'));
  // Intencionalmente SEM CORS: download precisa funcionar por navegacao.
  res.end(pdf);
});
await new Promise(resolve => storage.listen(0, '127.0.0.1', resolve));
const storageOrigin = `http://localhost:${storage.address().port}`;
const apiServer = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://api.test');
  receivedApi.push({ url: req.url, method: req.method, headers: req.headers });
  if (req.headers.origin === uiOrigin) {
    res.setHeader('Access-Control-Allow-Origin', uiOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Audit-Session-Id, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const json = (data, status = 200) => {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
  };
  if (u.pathname === '/api/anexos/presign') {
    assert.equal(req.headers.authorization, 'Bearer sessao-qa');
    assert(req.headers['x-audit-session-id']);
    await new Promise(resolve => setTimeout(resolve, 100));
    if (['negado', 'removido', 'expirado'].includes(mode))
      return json({ error: mode === 'negado' ? 'Sem permissao para acessar o arquivo.'
        : mode === 'removido' ? 'Arquivo removido ou nao encontrado.' : 'Sessao expirada. Entre novamente.' },
      mode === 'negado' ? 403 : mode === 'removido' ? 404 : 401);
    if (mode === 'invalido') return json({ url: 'javascript:alert(1)' });
    if (mode === 'legado') return json({ url: '/uploads/anexos/legado.pdf' });
    const params = new URLSearchParams({ 'X-Amz-Signature': `qa+/${++signature}` });
    if (u.searchParams.get('download') === '1')
      params.set('response-content-disposition', attachmentContentDisposition(name));
    return json({ url: `${storageOrigin}/medicao.pdf?${params}` });
  }
  if (u.pathname === '/uploads/anexos/legado.pdf') {
    assert.equal(req.headers.authorization, 'Bearer sessao-qa');
    res.setHeader('Content-Type', 'application/pdf'); return res.end(pdf);
  }
  if (u.pathname === '/api/redirecionar') {
    res.statusCode = 302; res.setHeader('Location', `${storageOrigin}/vazamento`); return res.end();
  }
  unexpected.push(`API ${req.method} ${u.pathname}`); return json({ error: 'Nao previsto' }, 500);
});
await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';import ModalMedicao from '/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx';
import{setAuthToken,installFetchSecurityDefaults}from '/src/services/api.js';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
document.cookie='fluxy_csrf=csrf-qa; Path=/';setAuthToken('sessao-qa');installFetchSecurityDefaults();
const medicao={id:9,numero:2,aprovada_em:null,anexos:[{id:7,nome_original:${JSON.stringify(name)},
caminho_arquivo:location.search.includes('legado')?'/uploads/anexos/legado.pdf':'https://fixture-bucket.s3.us-east-2.amazonaws.com/anexos/medicao.pdf'}]};
createRoot(document.getElementById('root')).render(<MemoryRouter><ModalMedicao medicao={medicao}
solicitacaoId={42} onFechar={()=>{}}/></MemoryRouter>);`;
const vite = await createServer({ root, configFile: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${apiOrigin}/api`) },
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'qa-download-medicao', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-download-medicao.jsx'; },
    load(id) { if (id === '\0qa-download-medicao.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(_code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:9,perfil:'USUARIO',setor:'OBRA'}});`;
    },
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/fixture', '<html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await vite.listen(); uiOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${uiOrigin}/fixture`);
  const button = () => page.getByRole('button', { name: `Baixar ${name}`, exact: true });
  await button().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Aprovar medição', exact: true }).count(), 0,
    'Consulta de anexo nao concede aprovacao');
  await page.getByRole('button', { name: `Visualizar ${name}`, exact: true }).click();
  const preview = page.getByRole('dialog', { name, exact: true });
  await preview.waitFor();
  const iframeUrl = await preview.locator('iframe').getAttribute('src');
  assert.equal(new URL(iframeUrl).origin, storageOrigin);
  assert(!new URL(iframeUrl).searchParams.has('response-content-disposition'), 'Preview nao vira attachment');
  assert.equal(new URL(apiOrigin + receivedApi.filter(r => r.method === 'GET'
    && r.url.startsWith('/api/anexos/presign')).at(-1).url).searchParams.has('download'), false);
  await preview.getByRole('button', { name: 'Fechar', exact: true }).click();
  console.log('OK preview separado, link novo autorizado e inline sem alterar assinatura');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const before = receivedApi.filter(r => r.method === 'GET' && r.url.startsWith('/api/anexos/presign')).length;
    const waiting = page.waitForEvent('download');
    await button().evaluate(el => { el.click(); el.click(); });
    const download = await waiting;
    assert.equal(download.suggestedFilename(), name);
    const target = path.join(output, `medicao-${width}.pdf`);
    await download.saveAs(target); assert.deepEqual(await fs.readFile(target), pdf);
    await button().waitFor({ state: 'visible' });
    assert.equal(receivedApi.filter(r => r.method === 'GET' && r.url.startsWith('/api/anexos/presign')).length, before + 1,
      'Dois cliques simultaneos geram somente um presign/download');
    assert.equal(new URL(apiOrigin + receivedApi.filter(r => r.method === 'GET' && r.url.startsWith('/api/anexos/presign')).at(-1).url).searchParams.get('download'), '1');
    assert.equal(receivedStorage.at(-1).method, 'GET');
    assert.equal(receivedStorage.at(-1).headers.origin, undefined, 'Download nao faz fetch/CORS');
    assert(new URL(storageOrigin + receivedStorage.at(-1).url).searchParams.get('X-Amz-Signature').startsWith('qa+/'));
    for (const header of ['authorization', 'x-csrf-token', 'x-audit-session-id', 'cookie', 'referer'])
      assert.equal(receivedStorage.at(-1).headers[header], undefined, header);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `download-${width}.png`) });
  }
  console.log('OK desktop/mobile, arquivo correto, nome UTF8, assinatura nova, duplo clique e S3 sem CORS/credenciais');

  for (const denied of ['negado', 'removido', 'expirado', 'invalido']) {
    mode = denied;
    const before = receivedStorage.length;
    await button().click();
    await page.getByText(denied === 'negado' ? 'Sem permissao para acessar o arquivo.'
      : denied === 'removido' ? 'Arquivo removido ou nao encontrado.'
        : denied === 'expirado' ? 'Sessao expirada. Entre novamente.' : 'O endereco do arquivo nao e valido.', { exact: true }).waitFor();
    assert.equal(receivedStorage.length, before, 'Nao acessar storage sem presign valido');
    assert(await button().isEnabled());
  }
  console.log('OK 401/403/404 e URL invalida sem navegar, com erro e liberacao do botao');

  mode = 'legado'; await page.goto(`${uiOrigin}/fixture?legado`);
  const waitingLocal = page.waitForEvent('download'); await button().click();
  const localDownload = await waitingLocal;
  const localPath = path.join(output, 'legado.pdf'); await localDownload.saveAs(localPath);
  assert.deepEqual(await fs.readFile(localPath), pdf);
  const legacyRequest = receivedApi.find(r => r.method === 'GET' && r.url.startsWith('/uploads/'));
  assert(legacyRequest); assert.equal(legacyRequest.headers.authorization, 'Bearer sessao-qa');
  assert(legacyRequest.headers['x-audit-session-id']);
  console.log('OK /uploads legado mantem presign/ACL e download autenticado somente na API');

  const external = await page.evaluate(async url => {
    const { authHeaders } = await import('/src/services/api.js');
    const response = await fetch(url, { headers: authHeaders(), credentials: 'include' });
    await response.json();
    return { csrf: authHeaders()['X-CSRF-Token'] };
  }, `${storageOrigin}/externo`);
  assert.equal(external.csrf, 'csrf-qa');
  assert.equal(receivedStorage.at(-1).headers.authorization, undefined);
  assert.equal(receivedStorage.at(-1).headers['x-audit-session-id'], undefined);
  assert.equal(receivedStorage.filter(r => r.method === 'OPTIONS').length, 0);
  const redirected = await page.evaluate(async url => {
    try { await fetch(url); return false; } catch { return true; }
  }, `${apiOrigin}/api/redirecionar`);
  assert(redirected); assert(!receivedStorage.some(r => r.url.startsWith('/vazamento')));
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK browser real: fetch externo sem preflight/token, CSRF protegido, redirect da API bloqueado');
} finally {
  await browser?.close(); await vite.close();
  await new Promise(resolve => apiServer.close(resolve));
  await new Promise(resolve => storage.close(resolve));
}
