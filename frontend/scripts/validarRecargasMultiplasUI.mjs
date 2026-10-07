// Browser isolado com APIs interceptadas. Nao conecta a backend ou banco.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5298, strictPort: true, proxy: {} } });
const saida = path.resolve(root, '../outputs/qa-recargas-multiplas');
await mkdir(saida, { recursive: true });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const erros = [];
  page.on('pageerror', (error) => erros.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  const cartoes = [{ id: 1, nome: 'Cartão Liz', ultimos_quatro: '1234' }, { id: 2, nome: 'Cartão Compras', ultimos_quatro: '5678' }];
  const enviados = [];
  const contexto = (id) => ({ ultima_recarga: { id, solicitacao_id: 100, cartao: cartoes[id - 1], valor_solicitado: 100 * id, valor_efetivo: 100 * id, titulo: { id: 90 + id, status: 'QUITADO' }, status_ciclo: 'PRESTACAO_PENDENTE', prestacao: { id, valor_base: 100 * id, status: enviados.some((item) => item.recarga_id === id) ? 'ENVIADA' : 'PENDENTE', rateios: [] } }, obras_disponiveis: [{ id: 11, nome: 'Centro administrativo', codigo: 'ADM', tipo_centro_custo: 'CENTRO_CUSTO' }], documentos_prestacao: uploads.flatMap((tipo, index) => tipo === `PRESTACAO_RECARGA_${id}` ? [{ id: index + 1, nome_original: 'Comprovante QA.pdf', caminho_arquivo: '/qa.pdf' }] : []), tipo_documento_prestacao: `PRESTACAO_RECARGA_${id}`, pode_validar: false });
  const uploads = [];
  await page.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.includes('/recargas-cartao/meus-cartoes')) return json({ cartoes: url.searchParams.get('obra_id') === '11' ? cartoes : [cartoes[0]] });
    if (/\/recargas-cartao\/cartoes\/\d+\/contexto/.test(url.pathname)) return json({ bloqueado: false, ultima_recarga: null });
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100')) return json({ recargas: [contexto(1), contexto(2)] });
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100/prestacao')) { enviados.push(request.postDataJSON()); return json({ recarga: contexto(enviados.at(-1).recarga_id).ultima_recarga }); }
    if (url.pathname.endsWith('/anexos/upload')) {
      const body = request.postData() || '';
      const tipo = /PRESTACAO_RECARGA_\d+/.exec(body)?.[0]; uploads.push(tipo);
      return json([{ id: uploads.length, nome_original: 'Comprovante QA.pdf', caminho_arquivo: '/qa.pdf' }]);
    }
    if (url.origin === 'http://127.0.0.1:5298' && !url.pathname.startsWith('/api')) return route.continue();
    // Bloqueio de qualquer chamada nao prevista, inclusive externa.
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:5298/scripts/fixtures/recargasCartoes.html');
  await page.waitForTimeout(1500);
  assert.deepEqual(erros, []);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByLabel('Valor da recarga Cartão Liz').fill('1.000,50');
  await page.getByLabel('Valor da recarga Cartão Compras').fill('200,00');
  await page.waitForFunction(() => document.querySelector('[data-testid="bloqueio"]').textContent === 'false');
  assert.equal(JSON.parse(await page.getByTestId('linhas').textContent()).length, 2);
  await page.getByLabel('Origem', { exact: true }).selectOption('10');
  await page.waitForFunction(() => document.querySelector('[data-testid="linhas"]').textContent === '[]');
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]').length === 1);
  await page.getByLabel('Origem', { exact: true }).selectOption('11');
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]').length === 2);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByLabel('Valor da recarga Cartão Liz').fill('100,00');
  await page.getByLabel('Valor da recarga Cartão Compras').fill('200,00');
  // Abrir os dois paineis e testar que cada upload envia o identificador do seu cartao.
  await page.getByRole('button', { name: /Recarga de cartão/ }).nth(0).click();
  await page.getByRole('button', { name: /Recarga de cartão/ }).nth(1).click();
  const inputs = page.locator('input[type="file"]');
  for (let i = 0; i < 2; i++) await inputs.nth(i).setInputFiles({ name: 'Comprovante QA.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA') });
  await page.waitForFunction(() => document.body.textContent.match(/Comprovante QA.pdf/g)?.length === 2);
  assert.deepEqual(uploads, ['PRESTACAO_RECARGA_1', 'PRESTACAO_RECARGA_2']);
  assert.equal(await page.getByText('Não se aplica ao centro de custo').count(), 2);
  assert.equal(await page.locator('[id="prestacao-recarga-1"]').count(), 1);
  assert.equal(await page.locator('[id="prestacao-recarga-2"]').count(), 1);
  const prestacoes = page.locator('section[aria-labelledby^="prestacao-recarga-"]');
  await prestacoes.nth(0).locator('input[inputmode="decimal"]').fill('100,00');
  await prestacoes.nth(1).locator('input[inputmode="decimal"]').fill('200,00');
  await prestacoes.nth(1).locator('textarea').fill('Rascunho do segundo cartão');
  await prestacoes.nth(0).getByRole('button', { name: 'Enviar prestação', exact: true }).click();
  await page.getByText('ENVIADA', { exact: true }).waitFor();
  assert.equal(enviados[0].recarga_id, 1);
  assert.equal(await prestacoes.nth(1).locator('textarea').inputValue(), 'Rascunho do segundo cartão');
  assert.match(await prestacoes.nth(1).locator('input[inputmode="decimal"]').inputValue(), /200/);
  await page.screenshot({ path: path.join(saida, 'desktop-claro.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(saida, 'desktop-escuro.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(saida, 'mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(erros, []);
  console.log('UI de recargas: multisselecao, troca de origem, valores BR, prestacoes/anexos independentes e mobile validados. APIs ficticias, sem banco.');
} finally { await browser?.close(); await server.close(); }
