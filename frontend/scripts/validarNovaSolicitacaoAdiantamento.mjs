// Pagina real, transporte interceptado; sem backend, escrita ou upload real.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5398;
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000); const errors = [], unexpected = [], enviados = [];
  page.on('pageerror', e => errors.push(e.message));
  const centro = { id: 30, codigo: 'ADM', nome: 'Administrativo', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true };
  const tipo = { id: 5, nome: 'DESPESA ADMINISTRATIVA', ativo: true, comportamento: { mostrar_valor: false, mostrar_favorecido: false, mostrar_forma_pagamento: false, mostrar_descricao: false, mostrar_subtipo: false } };
  const favorecido = { id: 6, nome: 'Favorecido QA', ativo: true, cpf_cnpj: '52998224725', pix_chave_fixa_1: 'favorecido@pix', pix_tipo_chave_fixa_1: 'EMAIL' };
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/obras/minhas')) return json([centro]);
    if (url.pathname.endsWith('/tipos-solicitacao/disponiveis')) return json({ tipos: [tipo], destino_inicial: { codigo: 'GEO', nome: 'Gerência de Processos' }, tipo_automatico: false });
    if (url.pathname.endsWith('/tipos-solicitacao')) return json([tipo]);
    if (url.pathname.endsWith('/tipos-sub-contrato')) return json([{ id: 7, nome: 'ADIANTAMENTO', ativo: true, usa_fluxo_adiantamento: true }, { id: 8, nome: 'DESPESA COMUM', ativo: true }]);
    if (url.pathname.endsWith('/configuracoes/nova-solicitacao-campos')) return json({ regras: {} });
    if (url.pathname.endsWith('/configuracoes/nova-solicitacao-automacao-destino')) return json({ destinos_disponiveis: [], regras: {} });
    if (url.pathname.endsWith('/contratos/medicoes/formas-pagamento')) return json({ formas: [{ id: 1, nome: 'Pix', tipo: 'PIX', ativo: true }] });
    if (url.pathname.endsWith('/parceiros')) return json([favorecido]);
    if (url.pathname.endsWith('/apropriacoes')) return json([]);
    if (url.pathname.endsWith('/centros-custo/30/obras-distribuicao')) return json({ regra: 'TODAS', obras: [{ id: 2, codigo: '02', nome: 'Obra privada' }] });
    if (url.pathname.endsWith('/solicitacoes') && req.method() === 'POST') { enviados.push(req.postDataJSON()); return json({ id: 101, codigo: 'SOL-QA' }, 201); }
    if (url.origin === `http://127.0.0.1:${port}` && !url.pathname.startsWith('/api')) return route.continue();
    unexpected.push(url.pathname); return route.abort('blockedbyclient');
  });
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/adiantamento.html?nova`);
  await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Administrativo');
  await page.getByRole('button', { name: /Administrativo.*ADM/ }).click();
  await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
  await page.locator('[name="tipo_sub_id"]').selectOption('7');
  await page.locator('[name="forma_pagamento_id"]').selectOption('1');
  await page.getByRole('combobox', { name: /Favorecido do pagamento/ }).fill('Favorecido');
  await page.getByRole('button', { name: /Favorecido QA/ }).click();
  await page.locator('[name="valor"]').fill('1.000,00');
  await page.locator('[name="descricao"]').fill('Adiantamento para despesas administrativas');
  await page.locator('[name="data_vencimento"]').fill('01/12/2099');
  await page.getByRole('radio', { name: /TODAS/ }).check();
  assert.equal(await page.getByText('Categoria financeira', { exact: true }).count(), 0, 'Categoria pertence ao GEO, nao ao solicitante');
  await page.getByRole('button', { name: /criar solicitação|enviar solicitação|salvar solicitação/i }).click();
  await page.waitForURL('**/solicitacoes/101').catch(async error => {
    console.error({ enviados, unexpected, errors, invalidos: await page.locator('input:invalid,select:invalid,textarea:invalid').evaluateAll(inputs => inputs.map(i => ({ name: i.name, valor: i.value, motivo: i.validationMessage }))), tela: (await page.locator('body').innerText()).slice(-3000) }); throw error;
  });
  assert.equal(enviados.length, 1); assert.equal(enviados[0].tipo_sub_id, '7'); assert.equal(enviados[0].favorecido_id, '6');
  assert.equal(Number(enviados[0].valor), 1000); assert.equal(enviados[0].forma_pagamento_id, '1');
  assert.equal(enviados[0].distribuicao_centro_custo.todas, true); assert(!enviados[0].recargas_cartoes);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('OK: Nova Solicitacao real com subtipo adiantamento, campos obrigatorios mesmo com tipo ocultando-os, favorecido/PIX, total e TODAS sem categoria antecipada. Sem banco/rede externa.');
} finally { await browser?.close(); await server.close(); }
