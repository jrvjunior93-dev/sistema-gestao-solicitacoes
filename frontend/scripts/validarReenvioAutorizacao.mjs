// Pagina e componentes reais; somente APIs/sessao simuladas, sem dominio externo.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { podeReenviarAutorizacao } from '../src/utils/autorizacaoPagamentoSituacao.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), prefix = '\0qa-reenvio-';
const plugin = {
  name: 'qa-reenvio', enforce: 'pre',
  resolveId(source, importer) {
    if (!importer?.endsWith('/FinanceiroAutorizacoesPagamento.jsx')) return;
    if (source === '../contexts/AuthContext') return prefix + 'auth';
    if (source === '../components/padrao') return prefix + 'padrao';
  },
  load(id) {
    if (id === prefix + 'auth') return `export const useAuth=()=>({user:{id:31,autorizacao_pagamentos:window.__caps},refreshSession:async()=>{}});`;
    if (id === prefix + 'padrao') return `import React from 'react';export const Pagina=({children})=>React.createElement('main',null,children);export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},avisar:{erro:()=>{},sucesso:()=>{},alerta:()=>{}}});`;
  },
  configureServer(server) {
    server.middlewares.use('/qa-reenvio', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-reenvio', `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import Page from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));</script></body></html>`));
    });
  }
};
const itemBase = { id: 7, lote_id: 151, titulo_financeiro_id: 17, origem_painel: 'AUTORIZACAO',
  status: 'AUTORIZADO', situacao_financeira: 'AUTORIZADO', snapshot_hash: 'qa', valor_snapshot: 100,
  titulo: { status: 'ABERTO', valor_saldo: 100, valor_baixado: 0 }, lote: { id: 151, codigo: 'LOTE-151', status: 'AUTORIZADO' },
  snapshot_json: { codigo: 'TIT-17', solicitacao: { codigo: 'SOL-17' }, credor: { nome: 'Credor QA' } }, documentos: [] };
assert(podeReenviarAutorizacao(itemBase));
for (const extra of [{ status: 'PENDENTE' }, { status: 'ENFILEIRADO' }, { origem_painel: 'FILA_DIRETA' },
  { bloqueado_proprietario: true }, { titulo: { status: 'QUITADO', valor_saldo: 0 } },
  { exclusao_titulo: { motivo: 'teste' } }, { titulo: null }, { fila_atual: { status: 'EM_EDICAO' } }]) assert(!podeReenviarAutorizacao({ ...itemBase, ...extra }));
const server = await createServer({ root, plugins: [plugin], server: { host: '127.0.0.1', port: 5326, strictPort: true, proxy: {} } });
await server.listen(); let browser;
const output = path.resolve(root, '../outputs/qa-reenvio-autorizacao'); await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  async function cenario({ query = '', caps = {}, width = 390 } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), erros = [], inesperadas = [], posts = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.addInitScript(c => { window.__caps = { mode: 'PILOT', enabled: true, can_decide: true, can_view: true, can_prepare: false, passkey_count: 1, ...c }; }, caps);
    let item = structuredClone(itemBase), hold = false, release;
    const lote = () => ({ id: 151, codigo: 'LOTE-151', status: item.status === 'ENFILEIRADO' ? 'CONCLUIDO' : 'AUTORIZADO', itens: [item], quantidade_itens: 1, valor_total: 100 });
    await page.route('**/*', async route => {
      const req = route.request(), u = new URL(req.url()), json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (req.isNavigationRequest()) return route.continue();
      if (u.pathname.endsWith('/151/enfileirar')) {
        posts.push(req.postDataJSON()); if (hold) await new Promise(r => { release = r; });
        item = { ...item, status: 'ENFILEIRADO', situacao_financeira: 'NA_FILA', fila_atual: { status: 'PENDENTE' } };
        return json(lote());
      }
      if (u.pathname.endsWith('/autorizacoes-pagamento/151')) return json(lote());
      if (u.pathname.endsWith('/autorizacoes-pagamento/painel/obras')) return json({ data: [{ obra_id: 1, obra_nome: 'Obra QA', quantidade_titulos: 1, valor_total: 100 }], resumo: {}, paginacao: { total: 1, mais: false } });
      if (u.pathname.endsWith('/autorizacoes-pagamento/painel/titulos')) return json({ data: [item], paginacao: { total: 1, mais: false } });
      if (u.pathname.endsWith('/financeiro/autorizacoes-pagamento')) return json({ data: [], paginacao: { total: 151, mais: false } });
      if (u.pathname.endsWith('/passkeys') || u.pathname.endsWith('/autorizadores')) return json({ data: [] });
      if (u.origin === 'http://127.0.0.1:5326' && !u.pathname.startsWith('/api')) return route.continue();
      inesperadas.push(u.pathname); return route.abort();
    });
    await page.goto('http://127.0.0.1:5326/qa-reenvio' + query);
    return { page, posts, erros, inesperadas, segurar: () => { hold = true; }, liberar: () => release?.() };
  }
  const um = await cenario();
  await um.page.getByRole('button', { name: /Obra QA/ }).click();
  await um.page.getByRole('button', { name: 'Reenviar para a fila', exact: true }).waitFor();
  await um.page.getByRole('button', { name: 'Abrir detalhes de TIT-17' }).click();
  const dialog = um.page.getByRole('dialog', { name: 'Detalhes do título para autorização' });
  await dialog.getByRole('button', { name: 'Atualizar título' }).waitFor();
  await dialog.getByRole('button', { name: 'Reenviar para a fila' }).waitFor({ state: 'visible' });
  await um.page.screenshot({ path: path.join(output, 'titulo-mobile.png'), fullPage: true });
  um.segurar();
  await dialog.getByRole('button', { name: 'Reenviar para a fila' }).evaluate(el => { el.click(); el.click(); });
  await um.page.waitForFunction(() => document.querySelector('[role="dialog"] button')?.disabled);
  assert.equal(await dialog.getByRole('button', { name: 'Anterior', exact: true }).isDisabled(), true);
  await um.page.keyboard.press('Escape');
  assert(await dialog.isVisible(), 'Escape nao fecha durante reenvio');
  assert.equal(um.posts.length, 1); um.liberar();
  await dialog.getByText('Na fila', { exact: true }).waitFor();
  assert.deepEqual(um.posts, [{ item_ids: [7] }]);
  assert.equal(await dialog.getByRole('button', { name: 'Reenviar para a fila' }).count(), 0);
  assert.deepEqual(um.erros, []); assert.deepEqual(um.inesperadas, []); await um.page.close();
  for (const width of [320, 1366]) {
    const c = await cenario({ query: '?reenvio=151', width });
    const aviso = c.page.getByRole('region', { name: 'Envio autorizado pendente' });
    await aviso.getByText('LOTE-151', { exact: false }).waitFor();
    assert.equal(c.posts.length, 0, 'Abrir notificacao nunca faz POST');
    assert(await aviso.getByRole('button', { name: 'Reenviar para a fila' }).isEnabled());
    assert(await c.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem overflow '+width);
    await c.page.screenshot({ path: path.join(output, `aviso-${width}.png`), fullPage: true });
    await aviso.getByRole('button', { name: 'Reenviar para a fila' }).click();
    await aviso.getByText('Reenvio concluído', { exact: true }).waitFor();
    assert.deepEqual(c.posts, [{ item_ids: [7] }]);
    assert.deepEqual(c.erros, []); assert.deepEqual(c.inesperadas, []); await c.page.close();
  }
  const leitura = await cenario({ query: '?reenvio=151', caps: { can_decide: false, can_prepare: false } });
  await leitura.page.getByText('LOTE-151', { exact: false }).waitFor();
  assert.equal(await leitura.page.getByRole('button', { name: 'Reenviar para a fila', exact: true }).count(), 0);
  assert.equal(leitura.posts.length, 0); await leitura.page.close();
  const pausado = await cenario({ query: '?reenvio=151', caps: { paused: true } });
  await pausado.page.getByText('LOTE-151', { exact: false }).waitFor();
  assert(await pausado.page.getByRole('button', { name: 'Reenviar para a fila', exact: true }).isDisabled());
  assert.equal(pausado.posts.length, 0); await pausado.page.close();
  console.log('Reenvio UI aprovado: lista/detalhe, clique duplo, busy/navegacao, item explicito, deep link fora da pagina de lotes, GET sem envio, ACL/PAUSED e 320/390/1366 sem overflow. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
