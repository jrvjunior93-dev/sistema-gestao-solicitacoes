// Tela/componentes/transporte reais; sessão, leitura e mutação HTTP isoladas.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5342, strictPort: true, proxy: {} }, plugins: [{
  name: 'qa-retirada-autorizacao', configureServer(s) {
    s.middlewares.use('/qa-retirada', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/qa-retirada', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from '/src/components/financeiro/AutorizacoesPorObra.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/financeiro-autorizacoes-pagamento.css';
function App(){const[busy,setBusy]=React.useState(false);const[user,setUser]=React.useState({id:31,areas_permissoes:location.search.includes('readonly')?[]:['financeiro.autorizacoes_pagamento.retirar','financeiro.fila_pagamentos.retirar']});window.__setUser=setUser;return React.createElement('main',{style:{padding:12}},React.createElement(Page,{user,userId:user.id,caps:{can_view:true,can_decide:false,mode:'PILOT'},busy,setBusy,abrirDocumento:()=>{throw Error('Documento inesperado')}}))}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(BrowserRouter,null,React.createElement(App))));</script></body></html>`));
    });
  }
}] });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [], unexpected = [], writes = []; page.on('pageerror', e => errors.push(e.message));
  const original = [1, 2, 3].map(id => ({ id, titulo_financeiro_id: id, lote_id: id, lote: { status: id === 2 ? 'CONCLUIDO' : 'AGUARDANDO' },
    status: id === 2 ? 'ENFILEIRADO' : id === 3 ? 'AUTORIZADO' : 'PENDENTE',
    situacao_financeira: id === 2 ? 'PARCIALMENTE_PAGO' : id === 3 ? 'AUTORIZADO' : 'AGUARDANDO', valor_snapshot: 100,
    titulo: { id, status: id === 2 ? 'PARCIAL' : 'ABERTO', valor_saldo: id === 2 ? 60 : 100, valor_baixado: id === 2 ? 40 : 0 },
    snapshot_json: { codigo: `TIT-QA-${id}`, credor: { nome: 'Fornecedor QA' } }, fila_atual: id === 2 ? { id: 88, status: 'DIVERGENTE' } : null }));
  let items = structuredClone(original), previewGate = null;
  await page.route('**/*', async route => {
    const p = route.request(), url = new URL(p.url());
    const json = v => route.fulfill({ contentType: 'application/json', body: JSON.stringify(v) });
    if (url.pathname.endsWith('/painel/obras')) return json({ data: [{ obra_id: 1, obra_nome: 'Obra QA', quantidade_titulos: items.length, valor_total: 300 }], resumo: { quantidade_titulos: items.length, valor_total: 300 }, paginacao: { pagina: 1, total: 1, mais: false } });
    if (url.pathname.endsWith('/painel/titulos')) return json({ data: items, paginacao: { pagina: 1, total: items.length, mais: false } });
    if (url.pathname.includes('/envios/retirada/')) {
      const body = p.postDataJSON();
      if (url.pathname.endsWith('/preview')) {
        if (previewGate) await new Promise(r => { previewGate(r); previewGate = null; });
        return json({ referencia: 'a'.repeat(64), saldo_total: 260, itens: body.itens.map(i => ({ ...i, codigo: 'TIT-QA-' + i.titulo_id, pago: i.titulo_id === 2 ? 40 : 0, saldo: i.titulo_id === 2 ? 60 : 100 })) });
      }
      writes.push(body); assert.deepEqual(body.itens.map(i => i.origem), ['AUTORIZACAO', 'FILA', 'AUTORIZACAO']);
      assert.deepEqual(body.itens.map(i => i.referencia_id), [1, 88, 3]);
      await new Promise(r => setTimeout(r, 80)); items = []; return json({ retirada_id: 1, retirados: body.itens });
    }
    if (url.origin === 'http://127.0.0.1:5342' && !url.pathname.startsWith('/api')) return route.continue();
    unexpected.push(url.pathname); return route.abort();
  });
  async function open(suffix = '') {
    await page.goto('http://127.0.0.1:5342/qa-retirada' + suffix); await page.getByRole('button', { name: /Obra QA/ }).click();
    await page.getByLabel('Selecionar TIT-QA-1', { exact: true }).waitFor();
  }
  await open('?readonly=1'); assert(await page.getByLabel('Selecionar TIT-QA-1', { exact: true }).isDisabled()); assert.equal(await page.getByRole('button', { name: /^Retirar envios/ }).count(), 0);
  for (const width of [1366, 390]) {
    items = structuredClone(original); await page.setViewportSize({ width, height: 900 }); await open();
    assert.equal(await page.getByRole('button', { name: /^(Autorizar|Rejeitar) selecionados/ }).count(), 0, 'Retirada nao concede decisao');
    await page.getByRole('checkbox', { name: 'Selecionar os disponíveis desta página', exact: true }).check();
    await page.getByRole('button', { name: 'Retirar envios (3)', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Retirar envios', exact: true }); await modal.getByText('TIT-QA-3', { exact: true }).waitFor();
    await modal.getByLabel('Motivo da retirada *').fill('Corrigir dados antes de novo envio');
    const output = path.resolve(root, '../outputs/retirada-envios-20261023'); await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `aprovacao-confirmacao-${width}.png`), fullPage: false });
    await modal.getByRole('button', { name: 'Confirmar retirada', exact: true }).dblclick(); await modal.waitFor({ state: 'detached' });
    assert.equal(writes.length, width === 1366 ? 1 : 2, 'Um POST por confirmacao mesmo com duplo clique');
    await page.getByText(/envio\(s\) retirado\(s\). Baixas anteriores preservadas/).waitFor();
    assert(await page.getByRole('button', { name: 'Limpar seleção de todas as páginas', exact: true }).isDisabled());
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK UI aprovacao real/StrictMode: retirada nominal sem decidir, selecao pendente/autorizado/fila parcial, IDs corretos, motivo, duplo clique, refresh e 1366/390. APIs isoladas.');
} finally { await browser?.close(); await server.close(); }
