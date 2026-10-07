// Componente real, APIs simuladas e bloqueio de qualquer acesso externo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5299;
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, proxy: {} } });
const saida = path.resolve(root, '../outputs/qa-cartao-opcional');
await mkdir(saida, { recursive: true });
await server.listen();
let browser, page;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(15000);
  const erros = [], inesperadas = [], envios = [];
  page.on('pageerror', (error) => erros.push(error.message));
  const formas = [{ id: 1, nome: 'Cartão de crédito QA', tipo: 'CARTAO_CREDITO', codigo: 'CARTAO_CREDITO', ativo: true, exige_cartao: true, gera_fatura: true, permite_parcelamento: true },
    { id: 2, nome: 'Cartão de débito QA', tipo: 'CARTAO_DEBITO', codigo: 'CARTAO_DEBITO', ativo: true, exige_cartao: true, permite_parcelamento: false }];
  const cartoes = [{ id: 10, nome: 'Crédito QA', tipo: 'CREDITO', ativo: true }, { id: 20, nome: 'Débito QA', tipo: 'DEBITO', ativo: true }];
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/solicitacoes/100/gerar-conta')) { envios.push(request.postDataJSON()); await new Promise((resolve) => setTimeout(resolve, 250)); return json({ id: envios.length, status: 'ABERTO' }); }
    if (url.pathname.endsWith('/solicitacoes/100/titulos-financeiros')) return json([]);
    if (url.pathname.endsWith('/financeiro/formas-pagamento')) return json(formas);
    if (url.pathname.endsWith('/financeiro/cartoes')) return json(cartoes);
    if (url.pathname.endsWith('/financeiro/categorias')) return json([{ id: 1, nome: 'Material QA', tipo: 'PAGAR', ativo: true, dre_grupo: 'CUSTOS' }]);
    if (url.pathname.endsWith('/empresas-grupo')) return json([{ id: 1, nome: 'Empresa QA', ativo: true }]);
    if (url.pathname.endsWith('/obras')) return json([{ id: 1, nome: 'Obra QA', empresa_grupo_id: 1 }]);
    if (url.pathname.endsWith('/parceiros/1')) return json({ id: 1, nome: 'Credor QA', fornecedor: true, ativo: true, cpf_cnpj: '12345678909' });
    if (url.pathname.endsWith('/parceiros')) return json([]);
    if (url.origin === `http://127.0.0.1:${port}` && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/solicitacoes/')) return route.continue();
    inesperadas.push(url.pathname); return route.abort('blockedbyclient');
  });
  for (const [formaId, cartaoId] of [['1', ''], ['2', ''], ['1', '10'], ['2', '20']]) {
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/cartaoOpcionalSolicitacao.html`);
    await page.getByRole('button', { name: 'Criar Título', exact: true }).click();
    const categoria = page.getByLabel('Categoria financeira deste título');
    await categoria.fill('Material');
    await page.getByRole('option', { name: /Material QA/ }).click();
    await page.getByLabel(/^Forma de pagamento/).selectOption(formaId);
    const cartao = page.getByLabel(/Cartão utilizado \(opcional\)/);
    assert.equal(await cartao.inputValue(), '');
    assert.equal(await cartao.getAttribute('required'), null);
    if (cartaoId) await cartao.selectOption(cartaoId);
    await page.getByText(cartaoId ? /Com cartão informado, a quitação automática/ : /Sem cartão informado, o título fica em aberto/).waitFor();
    if (formaId === '1' && !cartaoId) {
      await cartao.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(saida, 'desktop-claro.png') });
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.screenshot({ path: path.join(saida, 'desktop-escuro.png') });
    }
    const totalAntes = envios.length;
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.locator('#form-gerar-conta').waitFor({ state: 'detached' });
    assert.equal(envios.length, totalAntes + 1);
    const payload = envios.at(-1);
    assert.equal(payload.status, 'ABERTO');
    assert.equal(payload.pagamentos[0].forma_pagamento_id, formaId);
    assert.equal(payload.pagamentos[0].cartao_id, cartaoId || undefined);
  }
  assert.deepEqual(erros, []);
  assert.deepEqual(inesperadas, []);
  console.log('UI real da solicitacao: credito/debito com e sem cartao, envio e ajuda contextual validados com APIs simuladas.');
} catch (error) {
  if (page) { console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.join(saida, 'falha.png'), fullPage: true }); }
  throw error;
} finally { await browser?.close(); await server.close(); }
