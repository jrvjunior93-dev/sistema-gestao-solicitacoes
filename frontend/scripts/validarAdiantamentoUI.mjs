// Componentes reais no browser. APIs interceptadas; nenhum backend/banco/upload real.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5397, strictPort: true, proxy: {} } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const erros = []; page.on('pageerror', error => erros.push(error.message));
  let ciclo = { id: 1, status: 'PRESTACAO_PENDENTE', valor_solicitado: 1000 }, devolucao = null;
  const arquivos = [{ id: 1, nome_original: 'nota.pdf', caminho_arquivo: '/uploads/nota.pdf' }];
  const pedidos = [];
  let falhar = true, configuracao = null;
  const obras = [{ id: 30, codigo: 'ADM', nome: 'Administrativo' }, { id: 2, codigo: '02', nome: 'Obra Privada' }];
  const contexto = () => ({ ciclo, titulo: { id: 100, codigo: 'TIT-TESTE', status: 'QUITADO', valor_baixado: 1000 }, devolucao, obras, apropriacoes: [{ id: 8, obra_id: 2, codigo: '8', descricao: 'Materiais' }], anexos: arquivos, pode_conferir: true });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/configuracao-distribuicao')) {
      if (req.method() === 'PUT') { configuracao = req.postDataJSON(); return json(configuracao); }
      return json({ obras_ids: null, obras: [obras[1]] });
    }
    if (url.pathname.endsWith('/adiantamentos/solicitacoes/10')) return json(contexto());
    if (url.pathname.endsWith('/adiantamentos/solicitacoes/10/prestacao')) {
      const body = req.postDataJSON(); pedidos.push(body);
      if (falhar) { falhar = false; return json({ error: 'Conferência indisponível para teste; tente novamente.' }, 409); }
      ciclo = { ...ciclo, status: 'PRESTACAO_ENVIADA', prestacao: body }; return json(ciclo);
    }
    if (url.pathname.endsWith('/adiantamentos/solicitacoes/10/prestacao/decisao')) {
      const body = req.postDataJSON(); pedidos.push(body);
      ciclo = { ...ciclo, status: 'DEVOLUCAO_PENDENTE', prestacao: body.prestacao };
      devolucao = { codigo: 'TIT-DEV', valor_original: 200, status: 'ABERTO' }; return json(ciclo);
    }
    if (url.pathname.endsWith('/anexos/upload')) {
      assert.match(req.postData() || '', /PRESTACAO_ADIANTAMENTO/);
      arquivos.push({ id: 2, nome_original: 'outra-nota.pdf', caminho_arquivo: '/uploads/outra-nota.pdf' }); return json([arquivos[1]]);
    }
    if (url.origin === 'http://127.0.0.1:5397' && !url.pathname.startsWith('/api')) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:5397/scripts/fixtures/adiantamento.html');
  const pagamentoInicial = await page.evaluate(async () => {
    const { buildDefaultForm } = await import('/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
    return buildDefaultForm({ id: 10, valor: 1000, favorecido_id: 6, favorecido: { id: 6, nome: 'Favorecido QA' },
      tipoSubSolicitacao: { usa_fluxo_adiantamento: true }, forma_pagamento_id: 1 });
  });
  assert.equal(pagamentoInicial.pagamentos[0].parceiro_id, '6');
  assert.equal(pagamentoInicial.pagamentos[0].favorecido_pagamento_id, '6');
  assert.equal(pagamentoInicial.pagamentos[0].forma_pagamento_id, '1');
  assert.equal(pagamentoInicial.categoria_financeira_id, '', 'GEO escolhe a categoria, sem seed financeiro arbitrario');
  await page.getByLabel('Destino 1', { exact: true }).selectOption('2');
  await page.getByLabel('Apropriação 1', { exact: true }).selectOption('8');
  await page.getByLabel('Despesa 1', { exact: true }).fill('Materiais');
  await page.getByLabel('Valor 1', { exact: true }).fill('1200');
  assert(await page.getByRole('button', { name: 'Enviar prestação', exact: true }).isDisabled());
  await page.getByLabel('Valor 1', { exact: true }).fill('800');
  await page.getByLabel('Incluir nota.pdf').check();
  await page.locator('input[type=file]').setInputFiles({ name: 'outra-nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA') });
  await page.getByLabel('Incluir outra-nota.pdf').waitFor();
  assert.equal(await page.getByLabel('Despesa 1', { exact: true }).inputValue(), 'Materiais', 'Upload nao apaga digitacao');
  await page.getByRole('button', { name: 'Enviar prestação', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Valor 1', { exact: true }).inputValue(), '800', 'Erro nao apaga preenchimento');
  await page.getByRole('button', { name: 'Enviar prestação', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar prestação', exact: true }).waitFor();
  assert.equal(pedidos[1].itens[0].valor, 800); assert.equal(pedidos[1].itens[0].apropriacao_id, 8);
  assert.deepEqual(pedidos[1].anexo_ids, [1, 2]);
  assert(await page.getByRole('button', { name: 'Aprovar prestação', exact: true }).isDisabled());
  await page.getByText('Vencimento da devolução', { exact: true }).locator('input').fill('2099-12-01');
  await page.getByRole('button', { name: 'Aprovar prestação', exact: true }).click();
  await page.getByText(/TIT-DEV/).waitFor(); assert.equal(pedidos.length, 3);
  assert.equal(pedidos[2].data_devolucao, '2099-12-01');
  await page.getByRole('button', { name: 'Obras para rateio', exact: true }).click();
  await page.getByLabel('Todas as obras elegíveis').uncheck();
  await page.getByLabel('Pesquisar obras').fill('privada');
  await page.getByRole('checkbox', { name: /02 · Obra Privada/ }).check();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.deepEqual(configuracao.obras_ids, [2]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5397/scripts/fixtures/adiantamento.html?leitura');
  await page.getByText(/TIT-DEV/).waitFor();
  assert(await page.getByLabel('Despesa 1', { exact: true }).isDisabled());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Tabela nao provoca overflow da pagina');
  assert.deepEqual(erros, []);
  console.log('OK UI real: rateio/configuracao, despesas, comprovantes, upload sem apagar campos, retry, saldo/devolucao, negativas de leitura e mobile. Sem APIs reais.');
} finally { await browser?.close(); await server.close(); }
