// FinanceiroCard, ModalMedicao, permissoes, confirmacoes e HTTP reais; servidor simulado.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { tituloElegivelParaEnvioPagamento, titulosParaEnvioComContrato } from '../src/utils/envioTitulosPagamento.js';
const resumo = { id: 10, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: 1000, filaPagamentosManuais: [] };
const dto = { contrato: { fluxo_novo: true, solicitacao_id: 100 }, parcelas: [{ titulo_financeiro_id: 10, titulo_pagamento: resumo }] };
assert.deepEqual(titulosParaEnvioComContrato([], dto, 100), [resumo]);
assert.deepEqual(titulosParaEnvioComContrato([], dto, 101), []);
assert.deepEqual(titulosParaEnvioComContrato([], { ...dto, parcelas: [{ titulo_financeiro_id: 11, titulo_pagamento: resumo }] }, 100), []);
assert.equal(tituloElegivelParaEnvioPagamento({ ...resumo, status: 'PREVISAO' }), false);
assert.equal(tituloElegivelParaEnvioPagamento({ ...resumo, tipo: 'RECEBER' }), false);
assert.equal(tituloElegivelParaEnvioPagamento({ ...resumo, valor_saldo: 0 }), false);
assert.equal(tituloElegivelParaEnvioPagamento({ ...resumo, status: 'RENEGOCIADO' }), false);
assert.equal(tituloElegivelParaEnvioPagamento({ ...resumo, filaPagamentosManuais: [{ status: 'PENDENTE' }] }), false);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), port = 5321;
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, proxy: {} } });
const saida = path.join(root, '../outputs/qa-medicao-recarga-envio');
await mkdir(saida, { recursive: true });
await server.listen();
let browser, page, approved, queued, failSend, recarga, listaLegada;
const sends = [], approvals = [], unexpected = [], errors = [];
const delay = () => new Promise((resolve) => setTimeout(resolve, 150));
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => errors.push(error.message));
  const medicao = () => ({ id: 1, numero: 1, periodo_inicio: '2026-10-01', periodo_fim: '2026-10-07',
    favorecido: { nome: 'Credor QA' }, forma_pagamento: { nome: 'PIX', tipo: 'PIX' },
    aprovada_em: approved ? '2026-10-08T15:00:00Z' : null,
    anexos: [{ id: 1, nome_original: 'Medicao QA.pdf', tipo: 'ANEXO' }] });
  const titles = () => [1, 2].map((id) => ({ id, codigo: `TIT-QA-${id}`, tipo: 'PAGAR',
    status: id === 1 && (approved || recarga) ? 'ABERTO' : 'PREVISAO', valor_original: 100, valor_saldo: 100, valor_baixado: 0,
    parceiro: { nome: 'Credor QA' }, filaPagamentosManuais: id === 1 && queued ? [{ id: 1, status: 'PENDENTE' }] : [] }));
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/solicitacoes/100/titulos-financeiros')) return json(listaLegada ? [] : titles());
    if (url.pathname.endsWith('/contratos/1/parcelas')) return json({
      contrato: { id: 1, fluxo_novo: true, solicitacao_id: 100, permissoes: { aprovar: true, editar_medicao: true } },
      saldo: { saldo: 100, comprometido: 100 }, totais: { quantidade: 2 },
      parcelas: [1, 2].map((id) => ({ id, numero: id, valor: 100, valor_previsto: 100, vencimento: '2026-10-20',
        titulo_financeiro_id: id, titulo_pagamento: titles().find(titulo => titulo.id === id),
        situacao: id === 1 && approved ? 'ABERTO' : 'PREVISAO', medicao: id === 1 ? medicao() : null }))
    });
    if (url.pathname.endsWith('/contratos/medicoes/1/aprovar')) {
      approvals.push(1); await delay(); approved = true; return json({ medicao: medicao(), enviada_para: 'OBRA' });
    }
    if (request.method() === 'POST' && (url.pathname.endsWith('/financeiro/autorizacoes-pagamento') || url.pathname.endsWith('/financeiro/fila-pagamentos'))) {
      sends.push({ destino: url.pathname.endsWith('/autorizacoes-pagamento') ? 'AUTORIZACAO' : 'FILA', ...request.postDataJSON() });
      await delay();
      if (failSend) { failSend = false; return json({ error: 'Falha QA temporaria' }, 503); }
      if (url.pathname.endsWith('/fila-pagamentos')) queued = true;
      return json({ codigo: 'LOTE-QA', itens: [] });
    }
    if (url.pathname.endsWith('/parceiros/1')) return json({ id: 1, nome: 'Credor QA', fornecedor: true });
    if (['/financeiro/formas-pagamento', '/financeiro/cartoes', '/financeiro/categorias', '/empresas-grupo', '/obras', '/parceiros'].some((suffix) => url.pathname.endsWith(suffix))) return json([]);
    if (url.origin === `http://127.0.0.1:${port}` && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/solicitacoes/')) return route.continue();
    unexpected.push(url.href); return route.abort();
  });
  async function open(options = '') {
    approved = false; queued = false; failSend = false; recarga = options.includes('recarga');
    listaLegada = options.includes('listaLegada');
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/medicaoRecargaEnvio.html?${options}`);
    await page.getByRole('heading', { name: 'Financeiro', exact: true }).click();
    if (!recarga) {
      // Abrir Financeiro ja revela a tabela, sem segundo clique no subcard.
      await page.getByTestId('abrir-medicao-1').waitFor({ state: 'visible' });
      assert(await page.getByTestId('abrir-medicao-1').isVisible());
      await page.getByRole('heading', { name: /parcelas do contrato/i }).click();
      assert(await page.getByTestId('abrir-medicao-1').isVisible(), 'Clique no subcard nao recolhe Financeiro.');
      await page.getByTestId('abrir-medicao-1').click();
    }
  }
  async function approve() {
    await page.getByTestId('aprovar-medicao').click();
    await page.getByRole('button', { name: 'Aprovar medição', exact: true }).last().click();
    await page.getByTestId('medicao-aprovada-somente-leitura').waitFor();
    await page.waitForFunction(() => window.__atualizacoes > 0);
  }
  const modal = () => page.getByRole('dialog', { name: /Medição 1/ });
  await open();
  await page.getByTestId('aprovar-medicao').click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(approvals.length, 0, 'Cancelar nao aprova.');
  await approve(); assert.equal(approvals.length, 1);
  assert(await modal().isVisible(), 'Modal permanece aberto para envio.');
  const autorizacao = modal().getByRole('button', { name: 'Enviar para autorização', exact: true });
  const fila = modal().getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true });
  await autorizacao.waitFor(); assert(await fila.isEnabled());
  await autorizacao.click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal(sends.length, 0);
  // Dois cliques sincronos: somente um pedido de confirmacao e um POST.
  await autorizacao.evaluate((button) => { button.click(); button.click(); });
  await page.getByRole('button', { name: 'Solicitar autorização', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Títulos enviados ao proprietário'));
  assert.equal(sends.length, 1); assert.deepEqual(sends[0].titulo_ids, [1]);
  assert.equal(sends[0].destino, 'AUTORIZACAO'); assert(await fila.isEnabled());
  failSend = true;
  await fila.click(); await page.getByRole('button', { name: 'Enviar para pagamento', exact: true }).click();
  await page.getByText('Falha QA temporaria', { exact: true }).waitFor();
  await fila.click(); await page.getByRole('button', { name: 'Enviar para pagamento', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Títulos enviados para a Fila de Pagamentos'));
  assert.equal(sends[1].idempotency_key, sends[2].idempotency_key, 'Retry usa mesma chave.');
  assert.deepEqual(sends[2].titulo_ids, [1]); assert(await fila.isDisabled(), 'Ja enfileirado nao envia de novo.');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(saida, 'medicao-mobile.png') });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: path.join(saida, 'medicao-desktop.png') });
  for (const grant of ['FILA', 'AUTORIZACAO', 'NONE']) {
    await open(`grant=${grant}`); await approve();
    assert.equal(await modal().getByRole('button', { name: 'Enviar para autorização', exact: true }).count(), grant === 'AUTORIZACAO' ? 1 : 0);
    assert.equal(await modal().getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true }).count(), grant === 'FILA' ? 1 : 0);
  }
  await open('mode=OFF'); await approve();
  assert(await modal().getByRole('button', { name: 'Enviar para autorização', exact: true }).isDisabled());
  assert(await modal().getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true }).isEnabled());
  await open('listaLegada=1'); await approve();
  const filaLegada = modal().getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true });
  assert(await filaLegada.isEnabled(), 'Titulo real da parcela disponivel mesmo ausente da lista generica.');
  await filaLegada.click(); await page.getByRole('button', { name: 'Enviar para pagamento', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Títulos enviados para a Fila de Pagamentos'));
  assert.deepEqual(sends.at(-1).titulo_ids, [1]);
  assert(await filaLegada.isDisabled(), 'Resumo da parcela impede reenvio apos entrar na fila.');
  await open('recarga=1');
  await page.getByRole('checkbox', { name: 'Selecionar linha 1' }).check();
  assert(await page.getByRole('button', { name: 'Enviar para autorização', exact: true }).isEnabled());
  assert(await page.getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true }).isEnabled());
  await page.getByRole('button', { name: 'Enviar para fila de pagamentos', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar para pagamento', exact: true }).click();
  await page.waitForFunction(() => window.__atualizacoes > 0);
  assert.equal(sends.at(-1).destino, 'FILA'); assert.deepEqual(sends.at(-1).titulo_ids, [1]);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: modal/FinanceiroCard reais, aprovacao sem fechar, cancelamento, permissoes independentes, OFF, titulo medido apenas, duplo clique, retry idempotente, recarga e fila existente; desktop/mobile. APIs simuladas.');
} catch (error) {
  if (page) { console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.join(saida, 'falha.png'), fullPage: true }); }
  throw error;
} finally { await browser?.close(); await server.close(); }
