// Pagina/helper/HTTP/CSS reais, API interceptada. Sem backend/DB/upload externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { apresentarFormaPagamentoTitulo as apresentar } from '../src/utils/formaPagamentoTitulo.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/receber-forma-prevista'); fs.mkdirSync(output, { recursive: true });
const base = { tipo: 'RECEBER', origem_titulo: 'COMERCIAL', forma_pagamento_id: null, formaPagamento: null };
for (const [codigo, nome] of Object.entries({ DINHEIRO: 'Dinheiro', PIX: 'Pix', CARTAO: 'Cartão', TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto', CHEQUE: 'Cheque', PERMUTA: 'Permuta', BENS: 'Bens', OUTROS: 'Outros' })) {
  const r = apresentar({ ...base, formas_recebimento_previstas_contrato: [codigo] });
  assert.equal(r.nome, nome); assert.equal(r.codigo, codigo); assert.equal(r.sub, 'Prevista no contrato');
}
assert.equal(apresentar({ ...base, formas_recebimento_previstas_contrato: [' pix ', 'PIX', null, 'BOLETO'] }).nome, 'Boleto / Pix');
assert.equal(apresentar({ ...base, formas_recebimento_previstas_contrato: ['FINANCIAMENTO'] }).nome, 'FINANCIAMENTO');
for (const extra of [{ tipo: 'PAGAR' }, { origem_titulo: 'MANUAL' }, { forma_pagamento_id: 7 }]) {
  assert.equal(apresentar({ ...base, ...extra, formas_recebimento_previstas_contrato: ['CHEQUE'] }).prevista, false);
}
assert.equal(apresentar(null).nome, '');
const explicit = apresentar({ ...base, formaPagamento: { nome: 'Pix explícito', codigo: 'PIX' }, formas_recebimento_previstas_contrato: ['CHEQUE'] });
assert.equal(explicit.nome, 'Pix explícito'); assert.equal(explicit.sub, 'PIX'); assert.equal(explicit.prevista, false);

const row = (id, codigos, extra = {}) => ({ ...base, id, codigo: `TIT-QA-${id}`, numero_documento: `CONTRATO-QA/${id}`,
  obra_id: 10, obra: { id: 10, nome: 'Obra QA', codigo: 'OB-QA' }, parceiro: { id: 2, nome: 'Cliente QA' },
  empresa_id: 1, empresa: { id: 1, nome: 'Empresa QA' }, status: 'ABERTO', valor_original: '100.00',
  valor_baixado: '0.00', valor_saldo: '100.00', data_emissao: '2026-10-01', data_vencimento: '2026-11-01',
  formas_recebimento_previstas_contrato: codigos, ...extra });
const rows = [row(1, ['CHEQUE'], { status: 'PARCIAL', valor_baixado: '30.00', valor_saldo: '70.00', movimentos: [{ forma_recebimento: 'PIX' }] }),
  row(2, ['BOLETO']), row(3, ['BENS'], { status: 'QUITADO', valor_baixado: '100.00', valor_saldo: '0.00' }),
  row(4, ['CHEQUE'], { forma_pagamento_id: 9, formaPagamento: { id: 9, nome: 'Pix explícito', codigo: 'PIX' } }),
  row(5, [], { origem_titulo: 'MANUAL' }), row(6, ['BOLETO', 'PIX'])];
const snapshot = JSON.stringify(rows);
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-receber-prevista', enforce: 'pre',
  transform(_code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:7,perfil:'USUARIO',setor:{codigo:'FINANCEIRO'},areas_permissoes_configuradas:true,areas_permissoes:['financeiro.titulos.visualizar',...(location.search.includes('semexportar')?[]:['financeiro.titulos.exportar'])]}});`;
  },
  configureServer(vite) { vite.middlewares.use('/qa-receber-prevista', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/qa-receber-prevista', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Page from'/src/pages/FinanceiroTitulos.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},React.createElement('main',{className:'layout-main'},React.createElement(Page,{tipoFixo:'RECEBER'})))));
</script></body></html>`));
  }); }
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } }); page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(45000); // Compilacao fria local nao altera o prazo das interacoes.
  const errors = [], unexpected = [], requests = []; let negar = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('fluxy_auth_token', 'qa-local');
    URL.createObjectURL = blob => { blob.text().then(text => { window.qaCsv = text; }); return 'blob:qa-export'; };
    URL.revokeObjectURL = () => {};
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); };
  });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.includes('/api/')) {
      requests.push({ method: req.method(), path: url.pathname, query: Object.fromEntries(url.searchParams) });
      // Preferencias da consulta ja sao persistidas pela tela; apenas simular.
      if (req.method() === 'PUT' && /\/listas\/[^/]+\/preferencias\/geral$/.test(url.pathname)) return json(req.postDataJSON());
      if (req.method() !== 'GET') { unexpected.push(`${req.method()} ${url.pathname}`); return json({ error: 'Escrita nao permitida no QA' }, 500); }
      if (url.pathname.endsWith('/financeiro/titulos')) {
        if (negar) return json({ error: 'Acesso negado ao financeiro' }, 403);
        const data = url.searchParams.get('tipo') === 'PAGAR' ? [row(9, ['CHEQUE'], { tipo: 'PAGAR' })] : rows;
        return json({ data, pagination: { page: 1, limit: 25, total: data.length, total_pages: 1 } });
      }
      if (/\/(obras\/minhas|parceiros|financeiro\/(categorias|formas-pagamento|contas-bancarias|cartoes|cheques-terceiros|titulos\/status-interno-pagar))$/.test(url.pathname)) return json([]);
      if (url.pathname.endsWith('/financeiro/status-internos-pagar') || url.pathname.endsWith('/financeiro/fretes-pedidos/pendentes')) return json([]);
      unexpected.push(url.pathname); return json({ error: 'Endpoint inesperado no QA' }, 500);
    }
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/qa-receber-prevista?tipo=RECEBER&status=ABERTO,PARCIAL,QUITADO`;
  await page.goto(url);
  await page.getByText('TIT-QA-1', { exact: true }).waitFor();
  await page.getByText('Prevista no contrato', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('Prevista no contrato', { exact: true }).count(), 4);
  assert.equal(await page.getByText('Cheque', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Pix explícito', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Boleto / Pix', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Baixar selecionados', exact: true }).count(), 0);
  const consultasAntesExportar = requests.filter(r => r.path.endsWith('/financeiro/titulos')).length;
  await page.getByRole('button', { name: 'Exportar títulos', exact: true }).click();
  await page.waitForFunction(() => window.qaCsv?.includes('prevista no contrato'));
  const csv = await page.evaluate(() => window.qaCsv);
  assert(csv.includes('Cheque (prevista no contrato)')); assert(csv.includes('Pix explícito'));
  assert(!csv.includes('Pix explícito (prevista no contrato)'));
  assert.equal(requests.filter(r => r.path.endsWith('/financeiro/titulos')).length, consultasAntesExportar,
    'Exportacao usa a pagina carregada, sem nova consulta ou escrita');
  assert.equal(JSON.stringify(rows), snapshot);
  await page.screenshot({ path: path.join(output, 'receber-1366.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Prevista no contrato', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('Prevista no contrato', { exact: true }).count(), 4);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'receber-390.png'), fullPage: true });
  negar = true; await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByText('Acesso negado ao financeiro', { exact: false }).first().waitFor();
  negar = false; await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByText('TIT-QA-1', { exact: true }).waitFor();
  await page.goto(`${url}&semexportar=1`);
  await page.getByText('TIT-QA-1', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Exportar títulos', exact: true }).count(), 0);
  await page.goto(url.replace('tipo=RECEBER', 'tipo=PAGAR'));
  await page.getByText('TIT-QA-9', { exact: true }).waitFor();
  assert.equal(await page.getByText('Prevista no contrato', { exact: true }).count(), 0);
  assert.equal(JSON.stringify(rows), snapshot); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  assert(requests.filter(r => r.path.includes('/financeiro/')).every(r => r.method === 'GET'));
  console.log('UI Contas a Receber real: prevista/explicita/multipla/ausente, parcial/quitado sem usar baixa, CSV identificado, leitura/403/retry/sem exportar e PAGAR preservado; 1366/390 sem overflow. API isolada.');
} finally { if (browser) await browser.close(); await server.close(); }
