// Tela/servico reais; rede isolada, nenhum banco ou arquivo real.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/boletos-pedido');
fs.mkdirSync(output, { recursive: true });
const anexo = (id, tipo, nome, extra = {}) => ({ id, tipo, nome_original: nome,
  solicitacao_id: 42, caminho_arquivo: `https://arquivos.invalid/${nome}`, createdAt: '2026-10-16T12:00:00Z', ...extra });
const arquivos = [anexo(1, 'BOLETO_COMPRA', 'compra-antiga.pdf'), anexo(2, 'BOLETO_FRETE', 'frete-antigo.pdf'),
  anexo(3, 'BOLETO_COMPRA', 'excluido.pdf', { deleted_at: '2026-10-16' }), anexo(4, 'SOLICITACAO', 'nao-boleto.pdf'),
  anexo(5, 'BOLETO_COMPRA', 'novo.pdf'), anexo(6, 'BOLETO_COMPRA', 'outra-obra.pdf', { solicitacao_id: 99 }),
  anexo(7, 'BOLETO_FRETE', 'removido-historico.pdf'), anexo(8, 'BOLETO', 'solicitacao.pdf'),
  anexo(1, 'BOLETO_COMPRA', 'compra-antiga.pdf')];
const historicos = [{ id: 100, solicitacao_id: 42, acao: 'ANEXO_ADICIONADO', descricao: 'novo.pdf',
  createdAt: '2026-10-16T12:00:00Z', usuario: { nome: 'Compras QA' }, metadata: {
    anexo_id: 5, caminho: arquivos[4].caminho_arquivo, origem: 'PEDIDO_COMPRA', tipo_documento: 'BOLETO_COMPRA',
    pedido_compra_id: 10, pedido_compra_codigo: 'PC-00010' } },
  { id: 101, solicitacao_id: 42, acao: 'ANEXO_REMOVIDO', createdAt: '2026-10-16T13:00:00Z', metadata: { anexo_id: 7 } }];
const fixture = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';import Timeline from '/src/pages/SolicitacaoDetalhe/Timeline.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
function App(){const[id,setId]=useState(42);window.trocar=id=>setId(id);return <MemoryRouter><main className="p-3">
<Timeline key={id} solicitacaoId={id} historicos={id===42?${JSON.stringify(historicos)}:[]} canRemoveAnexo={false}/>
</main></MemoryRouter>;}createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'boletos-historico-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0boletos-historico-qa.jsx'; },
    async load(id) { if (id === '\0boletos-historico-qa.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';
        export const API_ORIGIN='https://fixture.invalid';export const authHeaders=()=>({'X-Fixture':'1'});
        export const fileUrl=p=>p;export const getAuthToken=()=>null;export const getAuditSessionId=()=>null;
        export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return 'export const useAuth=()=>({user:{id:2}});';
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(), errors = [], unexpected = [], consultas = [], assinaturas = [];
  let negar = false, negarLista = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { HTMLAnchorElement.prototype.click = function () { window.baixados = [...(window.baixados || []), this.download]; }; });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (['chrome:', 'chrome-extension:'].includes(url.protocol)) return route.continue();
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'seguro.invalid') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-QA' });
    if (url.pathname.match(/\/solicitacoes\/\d+\/anexos$/)) {
      assert.equal(req.method(), 'GET'); consultas.push(url.pathname);
      const id = Number(url.pathname.split('/').at(-2));
      return route.fulfill({ status: negarLista ? 403 : 200, contentType: 'application/json', body: JSON.stringify(id === 42 ? arquivos : []) });
    }
    if (url.pathname.endsWith('/anexos/presign')) {
      assert.equal(req.method(), 'GET'); assert.equal(req.headers()['x-fixture'], '1');
      assinaturas.push(Object.fromEntries(url.searchParams));
      await new Promise(r => setTimeout(r, 90));
      return route.fulfill({ status: negar ? 403 : 200, contentType: 'application/json', body: JSON.stringify(negar ? { error: 'Acesso negado ao boleto QA' } : { url: 'https://seguro.invalid/boleto.pdf' }) });
    }
    unexpected.push(req.url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  for (const width of [1366, 390]) {
    const assinaturasAntes = assinaturas.length;
    await page.setViewportSize({ width, height: 900 }); await page.goto(base);
    assert.equal(consultas.length, width === 1366 ? 0 : 1, 'Historico recolhido nao consulta anexos');
    await page.getByRole('button', { name: /^Histórico/ }).click();
    const lista = page.getByRole('region', { name: 'Boletos dos pedidos', exact: true });
    await lista.getByText('compra-antiga.pdf', { exact: true }).waitFor();
    assert.equal(await lista.getByRole('listitem').count(), 2);
    for (const nome of ['excluido.pdf', 'nao-boleto.pdf', 'novo.pdf', 'outra-obra.pdf', 'removido-historico.pdf', 'solicitacao.pdf']) assert.equal(await lista.getByText(nome, { exact: true }).count(), 0);
    await page.getByText('Boleto anexado ao pedido', { exact: true }).waitFor();
    assert.equal(await page.getByText('novo.pdf', { exact: true }).count(), 1);
    await lista.getByRole('button', { name: 'Visualizar compra-antiga.pdf', exact: true }).evaluate(el => { el.click(); el.click(); });
    const preview = page.getByRole('dialog', { name: 'compra-antiga.pdf', exact: true });
    await preview.locator('iframe').waitFor();
    assert(!assinaturas.at(-1).historico_id, 'Arquivo antigo usa registro do anexo, nao inventa ID de historico');
    assert.equal(assinaturas.length, assinaturasAntes + 1, 'Duplo clique pede uma unica assinatura');
    await preview.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Visualizar compra-antiga.pdf');
    await lista.getByRole('button', { name: 'Baixar frete-antigo.pdf', exact: true }).click();
    await page.waitForFunction(() => window.baixados?.includes('frete-antigo.pdf'));
    const novo = page.locator('.sol-detail-timeline-item').filter({ has: page.getByText('novo.pdf', { exact: true }) });
    assert.equal(await novo.getByRole('button', { name: 'Visualizar PC-00010', exact: true }).count(), 0);
    await novo.getByRole('button', { name: 'Visualizar', exact: true }).click();
    const previewNovo = page.getByRole('dialog', { name: 'novo.pdf', exact: true });
    await previewNovo.locator('iframe').waitFor();
    assert.equal(assinaturas.at(-1).historico_id, '100', 'Novo evento usa o presign com ID real do historico');
    await previewNovo.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.screenshot({ path: path.join(output, `historico-${width}.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem rolagem horizontal no historico');
  }
  negar = true;
  const lista = page.getByRole('region', { name: 'Boletos dos pedidos', exact: true });
  await lista.getByRole('button', { name: 'Visualizar compra-antiga.pdf', exact: true }).click();
  await lista.getByRole('alert').filter({ hasText: 'Acesso negado ao boleto QA' }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, '403 nao abre arquivo');
  negar = false;
  await page.evaluate(() => window.trocar(99));
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('Consultando boletos'));
  assert.equal(await page.getByText('compra-antiga.pdf', { exact: true }).count(), 0);
  negarLista = true;
  await page.evaluate(() => window.trocar(42));
  await page.getByRole('button', { name: /^Histórico/ }).click();
  await page.getByRole('alert').filter({ hasText: 'Não foi possível consultar' }).waitFor();
  negarLista = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByText('compra-antiga.pdf', { exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: historico real desktop/mobile, compra/frete antigos, novos sem duplicidade, excluidos/escopo, lazy GET, preview/download, mutex, 403/retry e troca de solicitacao. Sem escrita externa.');
} finally { if (browser) await browser.close(); await server.close(); }
