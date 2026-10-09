// HTTP, hook e componentes reais; respostas locais, sem banco ou API externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { opcoesAvisoPendenciasEntrega } from '../src/utils/avisoPendenciasEntrega.js';

assert.equal(opcoesAvisoPendenciasEntrega(new Error('Legado')), undefined);
assert.equal(opcoesAvisoPendenciasEntrega({ code: 'OUTRO', details: { solicitacoes: [] } }), undefined);
assert.match(opcoesAvisoPendenciasEntrega({ code: 'COMPRA_ENTREGA_PENDENTE', details: {
  solicitacoes: [{ codigo: null, pedidos: [227], itens_pendentes: 1 }]
} }).itens[0], /Solicitação sem código.*#227/);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = `import React from 'react'; import {createRoot} from 'react-dom/client';
import Avisos, {useAvisos} from '/src/components/padrao/Avisos.jsx';
import {criarSolicitacaoCompra,criarSolicitacaoCompraDireta} from '/src/services/compras.js';
import {createSolicitacao} from '/src/services/solicitacoes.js';
import {opcoesAvisoPendenciasEntrega} from '/src/utils/avisoPendenciasEntrega.js';
import '/src/index.css'; import '/src/styles/design-tokens.css';
import '/src/styles/escala.css'; import '/src/styles/componentes-padrao.css';
function App(){ const {avisos,avisar,fechar}=useAvisos();
async function enviar(tipo){try{await ({direta:criarSolicitacaoCompraDireta,compra:criarSolicitacaoCompra,normal:createSolicitacao}[tipo])({obra_id:3});}
catch(e){avisar.erro(e.message,undefined,opcoesAvisoPendenciasEntrega(e));}}
return React.createElement('main',null,
React.createElement('button',{onClick:()=>enviar('direta')},'Compra direta'),
React.createElement('button',{onClick:()=>enviar('compra')},'Solicitação de compra'),
React.createElement('button',{onClick:()=>enviar('normal')},'Solicitação normal'),
React.createElement(Avisos,{avisos,aoFechar:fechar}));}
createRoot(document.getElementById('root')).render(React.createElement(App));`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'aviso-entrega-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/fixture-entrega.jsx') return '\0fixture-entrega.jsx'; },
    load(id) { if (id === '\0fixture-entrega.jsx') return js; },
    configureServer(s) { s.middlewares.use('/qa-aviso-entrega', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/qa-aviso-entrega', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture-entrega.jsx"></script></body></html>'));
    }); }
  }, react()] });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const erros = [], inesperadas = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  let quantidade = 2, legado = false;
  await page.route('**/*', (route) => {
    const req = route.request(), url = new URL(req.url());
    if (/\/api\/(compras\/solicitacoes(?:-diretas)?|solicitacoes)$/.test(url.pathname)) {
      assert.equal(req.method(), 'POST');
      const error = legado ? 'Aviso antigo sem lista' : 'Informe a entrega vencida antes de criar Solicitação de Compra ou Compra Direta.';
      const details = { solicitacoes: Array.from({ length: quantidade }, (_, i) => ({
        codigo: i === 0 ? 'SOL-6265' : `SOL-${6300 + i}`, solicitacao_id: 7 + i,
        pedidos: i === 0 ? [227, 228] : [229 + i], itens_pendentes: i === 0 ? 3 : 1
      })) };
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(
        legado ? { error } : { error, code: 'COMPRA_ENTREGA_PENDENTE', details }) });
    }
    if (url.origin === origin && !url.pathname.startsWith('/api')) return route.continue();
    inesperadas.push(url.href); return route.abort();
  });
  await page.goto(`${origin}/qa-aviso-entrega`);
  const aviso = page.getByRole('alert');
  for (const nome of ['Compra direta', 'Solicitação de compra', 'Solicitação normal']) {
    await page.getByRole('button', { name: nome, exact: true }).click();
    await aviso.getByText(/SOL-6265.*#227, #228.*3 itens pendentes/).waitFor();
    assert.equal(await aviso.count(), 1);
    assert.equal(await aviso.getByRole('listitem').count(), 2);
    assert.equal(await aviso.getByText(/SOL-6301.*1 item pendente/).count(), 1);
  }
  quantidade = 30;
  await page.getByRole('button', { name: 'Compra direta', exact: true }).click();
  await aviso.getByText(/SOL-6329/).waitFor();
  assert.equal(await aviso.getByRole('listitem').count(), 30, 'Lista nao truncada pelo limite de mensagem');
  for (const width of [1366, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const bounds = await aviso.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height < 812);
    const lista = aviso.getByRole('list');
    assert.equal(await lista.evaluate((el) => el.scrollHeight > el.clientHeight), true, 'Lista longa rolavel dentro do mesmo card');
    await lista.focus(); await lista.hover(); await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => document.querySelector('.app-aviso-lista')?.scrollTop > 0);
    const dir = path.join(root, '../outputs/aviso-pendencias-entrega');
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `aviso-${width}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  quantidade = 1;
  await page.getByRole('button', { name: 'Solicitação de compra', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.app-aviso-lista li').length === 1);
  await aviso.getByText(/SOL-6265/).waitFor();
  assert.equal(await aviso.getByRole('listitem').count(), 1);
  legado = true;
  await page.getByRole('button', { name: 'Compra direta', exact: true }).click();
  await aviso.getByText('Aviso antigo sem lista').waitFor();
  assert.equal(await aviso.getByRole('listitem').count(), 0);
  await aviso.getByRole('button', { name: 'Fechar', exact: true }).click();
  assert.equal(await aviso.count(), 0);
  assert.deepEqual(erros, []); assert.deepEqual(inesperadas, []);
  console.log('OK: transportes reais de compra direta/compra/solicitacao, SOL principal, lista unica completa, 1/2/30 solicitacoes, fechamento, legado e desktop/mobile. Sem API externa.');
} finally { await browser?.close(); await server.close(); }
