import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import Tela from '/src/pages/RhDpTransferencias.jsx';
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="layout-main" style={{padding:16,minWidth:0}}><Tela/></main></MemoryRouter>);`;
const mocks = `const obras=[{id:1,nome:'Obra de origem',codigo:'101'},{id:2,nome:'Obra de destino',codigo:'102'}];
const s={id:10,colaborador:{id:7,nome:'Ana Teste'},obra:obras[0],obra_id:1,obra_destino_id:2,obra_destino_nome:obras[1].nome,
obra_aprovadora_id:1,situacao:'ABERTA',nao_lida:true,pode_decidir:true,pode_cancelar:false,atividade_em:'2026-09-18T15:00:00Z',historicos:[{id:1,descricao:'Transferência solicitada',usuario_id:22,createdAt:'2026-09-18T15:00:00Z'}]};
export async function rhTransferencias(path='',opts={}){
if(path==='/configuracao')return {obras,obras_responsavel_ids:[1]};
if(path==='/diretorio')return {itens:[{id:7,nome:'Ana Teste',matricula:'M7',cargo:'Pedreira',obra_id:1,obra:obras[0]}],total:1,pagina:1};
if(opts.method==='POST'){window.envios=(window.envios||[]);window.envios.push({path,...opts});await new Promise(r=>setTimeout(r,200));return {id:10};}
if(path==='/10')return s;
return [s];}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'fixture-rh-transferencia', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-rh-transferencia.jsx'; },
    async load(id) { if (id === '\0fixture-rh-transferencia.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/rhDp.js')) return mocks; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (req.url !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar transferência', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.evaluate(() => (window.envios || []).length), 0, 'Cancelar confirmacao nao deve aprovar');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar transferência', exact: true }).click();
  await page.getByLabel('Obra de destino', { exact: true }).selectOption('2');
  await page.getByLabel('Justificativa', { exact: true }).fill('Apoio à etapa da obra de destino');
  const out = path.join(root, '../outputs/rh-pessoal-transferencias'); fs.mkdirSync(out, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).evaluate(el => {
      const panel = el.firstElementChild.getBoundingClientRect();
      return { left: panel.left, right: panel.right, width: innerWidth };
    });
    assert(bounds.left >= 0 && bounds.right <= bounds.width + 1, JSON.stringify(bounds));
    await page.screenshot({ path: path.join(out, `transferencia-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Enviar para aprovação', exact: true }).click();
  await page.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).waitFor({ state: 'hidden' });
  const envios = await page.evaluate(() => window.envios);
  assert.equal(envios.length, 1);
  assert.equal(envios[0].data.obra_solicitante_id, 1); assert.equal(envios[0].data.obra_destino_id, 2);
  assert(!('data_vigencia' in envios[0].data));
  assert.deepEqual(errors, []);
  console.log('OK: transferencia na UI, cancelamento seguro, diretorio, envio, responsividade desktop/mobile. Sem API externa.');
} finally { await browser.close(); await server.close(); }
