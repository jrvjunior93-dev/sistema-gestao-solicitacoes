// Modal e services reais, HTTP isolado. Nao acessa banco, EC2 ou usuario real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-ofx-obras', enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/pages/FinanceiroConciliacao.jsx')) return code + '\nexport { NovoTituloRapidoModal };';
  },
  configureServer(vite) {
    vite.middlewares.use('/qa-ofx', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/qa-ofx', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{NovoTituloRapidoModal}from'/src/pages/FinanceiroConciliacao.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
function App(){const[open,setOpen]=React.useState(true);return open?React.createElement(NovoTituloRapidoModal,{item:{id:501,valor:-10500,descricao_banco:'Cheque Compensação',data_movimento:'2026-10-18',conta_bancaria_id:9},contas:[{id:9,nome:'Conta QA',empresa_id:2}],onClose:()=>setOpen(false),onConciliar:async()=>{window.__conciliou=(window.__conciliou||0)+1}}):React.createElement('p',null,'Modal fechado QA')}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`));
    });
  }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], unexpected = [], consultas = [], posts = [];
let negar = false, vazio = false, categoriasFalham = false, lento = false, liberar;
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/obras/minhas')) {
    consultas.push(Object.fromEntries(url.searchParams));
    if (lento) await new Promise(resolve => { liberar = resolve; });
    if (negar) return json({ error: 'Acesso financeiro negado QA' }, 403);
    const modo = url.searchParams.get('modo'), escopo = url.searchParams.get('escopo');
    return json(!vazio && modo === 'FINANCEIRO' && escopo === 'TODOS'
      ? [{ id: 1, nome: 'Obra QA' }, { id: 2, nome: 'Administrativo QA' }] : []);
  }
  if (url.pathname.endsWith('/financeiro/categorias')) return categoriasFalham ? json({ error: 'Categorias indisponíveis QA' }, 500)
    : json([{ id: 7, nome: 'Despesas QA', tipo: 'PAGAR', considera_dre: true, dre_grupo: 'DESPESAS_OPERACIONAIS' }]);
  if (url.pathname.endsWith('/parceiros')) return json({ itens: [{ id: 55, nome: 'Fornecedor QA' }] });
  if (url.pathname.endsWith('/financeiro/conciliacoes/501/criar-titulo')) {
    assert.equal(req.method(), 'POST'); posts.push(req.postDataJSON()); return json({ ok: true });
  }
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-ofx`;
const obra = () => page.getByLabel(/^Obra \/ Centro de Custo/);
const salvar = () => page.getByRole('button', { name: 'Criar, baixar e conciliar', exact: true });
const pronto = async () => {
  await obra().waitFor();
  await page.waitForFunction(() => {
    const select = [...document.querySelectorAll('select')].find(el => el.closest('label')?.textContent.includes('Centro de Custo'));
    return select && !select.disabled;
  });
};
try {
  await page.goto(base); await pronto();
  assert.deepEqual(consultas[0], { modo: 'FINANCEIRO', escopo: 'TODOS' });
  assert.deepEqual(await obra().locator('option').allTextContents(), ['Selecione', 'Obra QA', 'Administrativo QA']);
  await obra().selectOption('2');
  await page.getByLabel(/^Categoria/).selectOption('7');
  await page.getByPlaceholder('Digite nome ou CNPJ...').fill('Fornecedor');
  await page.getByRole('button', { name: 'Fornecedor QA', exact: true }).click();
  const output = path.resolve(root, '../outputs/ofx-obras-financeiro-20261018'); fs.mkdirSync(output, { recursive: true });
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.overflow-y-auto').first().evaluate(el => el.scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Modal sem overflow '+width);
    await page.screenshot({ path: path.join(output, `obras-centros-${width}.png`) });
  }
  await salvar().click(); await page.getByText('Modal fechado QA', { exact: true }).waitFor();
  assert.equal(posts.length, 1); assert.equal(await page.evaluate(() => window.__conciliou), 1);
  assert.deepEqual({ obra: posts[0].obra_id, conta: posts[0].conta_bancaria_id, empresa: posts[0].empresa_id,
    valor: posts[0].valor, tipo: posts[0].tipo, parceiro: posts[0].parceiro_id, categoria: posts[0].categoria_financeira_id },
  { obra: 2, conta: 9, empresa: 2, valor: 10500, tipo: 'PAGAR', parceiro: 55, categoria: 7 });

  negar = true; await page.goto(base);
  await page.getByRole('alert').filter({ hasText: 'Acesso financeiro negado QA' }).waitFor();
  assert(await salvar().isDisabled()); assert(await obra().isDisabled());
  negar = false; await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await pronto();
  assert.equal(await obra().locator('option').count(), 3);
  categoriasFalham = true; await page.goto(base);
  await page.getByRole('alert').filter({ hasText: 'Categorias indisponíveis QA' }).waitFor();
  assert(await salvar().isDisabled()); categoriasFalham = false;
  vazio = true; await page.goto(base); await pronto();
  await page.getByText('Nenhuma obra ou centro de custo disponível para este usuário.', { exact: true }).waitFor();
  assert(await salvar().isDisabled()); vazio = false;
  lento = true; await page.goto(base);
  await obra().locator('option', { hasText: 'Carregando…' }).waitFor({ state: 'attached' });
  assert(await salvar().isDisabled());
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByText('Modal fechado QA', { exact: true }).waitFor();
  liberar?.(); lento = false;
  assert.equal(posts.length, 1, 'Consultas/falhas/retry/fechamento nao criam titulo');
  assert(consultas.every(q => q.modo === 'FINANCEIRO' && q.escopo === 'TODOS'));
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: OFX real com obras/centros sem vinculos, modo financeiro, payload e DRE preservados, 403/500/retry/vazio/loading/cleanup, mobile/desktop. HTTP isolado.');
} catch (error) {
  console.error({ errors, unexpected, body: await page.locator('body').innerText() }); throw error;
} finally { liberar?.(); await page.close(); await browser.close(); await server.close(); }
