// Componente e servicos reais; HTTP interceptado, sem banco/S3/usuarios reais.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-rh-documentos', configureServer(vite) {
    vite.middlewares.use('/qa-documentos', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/qa-documentos', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import Exportacao from '/src/components/rh/RhDocumentosExportacao.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
function App(){const[empresa,setEmpresa]=React.useState('');return React.createElement('main',{style:{padding:16}},React.createElement('label',null,'Empresa QA',React.createElement('select',{value:empresa,onChange:e=>setEmpresa(e.target.value)},...['','3','4'].map(id=>React.createElement('option',{key:id,value:id},id||'Selecione')))),React.createElement(Exportacao,{empresaId:empresa,obraId:7}));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`));
    });
  }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], unexpected = [], consultas = [], zips = [];
let falha = true, lento = false, liberar, avisarInicio;
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/rh/documentos/exportacao/zip')) {
    zips.push(Object.fromEntries(url.searchParams));
    avisarInicio?.(); avisarInicio = null;
    if (lento) await new Promise(ok => { liberar = ok; });
    if (falha) return json({ error: 'Sem acesso fixture' }, 403);
    return route.fulfill({ contentType: 'application/zip', headers: {
      'X-RH-Proximo-Cursor': url.searchParams.get('apos_id') === '10' ? 'FIM' : '10',
      'X-RH-Quantidade-Colaboradores': '5'
    }, body: Buffer.from('PK-zip-fixture') }).catch(() => {});
  }
  if (url.pathname.endsWith('/rh/documentos/exportacao')) {
    consultas.push(Object.fromEntries(url.searchParams));
    const segundo = url.searchParams.get('apos_id') === '10';
    return json({ itens: Array.from({ length: segundo ? 5 : 10 }, (_, i) => ({ id: i + (segundo ? 11 : 1) })), proximo_cursor: segundo ? null : 10 });
  }
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(url.href); return route.abort();
});
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-documentos`);
  const baixar = () => page.getByRole('button', { name: 'Baixar ZIP', exact: true });
  await baixar().waitFor(); assert(await baixar().isDisabled());
  await page.getByLabel('Empresa QA').selectOption('3');
  await baixar().click(); await page.getByRole('alert').waitFor();
  assert.equal(zips[0].apos_id, undefined);
  falha = false;
  await Promise.all([page.waitForEvent('download'), baixar().click()]);
  await page.getByRole('button', { name: 'Baixar próximo lote' }).waitFor();
  assert.equal(zips[1].apos_id, undefined, 'Falha nao avanca cursor');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar próximo lote' }).click()]);
  await page.getByRole('button', { name: 'Reiniciar exportação' }).waitFor();
  assert.equal(zips[2].apos_id, '10');
  await page.getByLabel('Documentos para baixar').selectOption('COMPLETO');
  lento = true;
  const inicio = new Promise(ok => { avisarInicio = ok; });
  await baixar().click();
  await inicio;
  await page.waitForFunction(() => document.querySelector('button')?.textContent.includes('Gerando'));
  const anterior = zips.length;
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Gerando')); b.click(); b.click(); });
  assert.equal(zips.length, anterior);
  assert.equal(zips.at(-1).modo, 'COMPLETO');
  assert.equal(zips.at(-1).apos_id, undefined, 'Troca de modo reinicia lote');
  await page.getByRole('button', { name: 'Cancelar download' }).click();
  liberar(); lento = false;
  await baixar().waitFor();
  await page.getByLabel('Empresa QA').selectOption('4');
  const dest = path.join(root, '../outputs/rh-documentos-20261018'); fs.mkdirSync(dest, { recursive: true });
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Sem corte horizontal em ${width}`);
    await page.screenshot({ path: path.join(dest, `exportacao-${width}.png`), fullPage: true });
  }
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(unexpected.length, 0, unexpected.join('\n'));
  const pessoal = fs.readFileSync(path.join(root, 'src/pages/RhDpPessoal.jsx'), 'utf8');
  assert(!pessoal.includes('Transferências disponíveis somente entre obras.'));
  assert(pessoal.includes('parseCurrencyInput(f.valor_diaria)'));
  const cadastro = fs.readFileSync(path.join(root, 'src/pages/RhDpColaboradores.jsx'), 'utf8');
  assert(cadastro.includes('data_inicio_efetivo_obra: form.data_inicio_efetivo_obra || null'));
  console.log('RH UI: exportacao real/HTTP isolado, dois modos, cursor/retry/cancelamento, bloqueio duplo, 320/390/768/1366 sem corte e campos de diaria/data aprovados.');
} finally { await browser.close(); await server.close(); }
