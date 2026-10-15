// Navegador isolado: API ficticia, nenhum backend/banco ou upload real.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5299, strictPort: true, proxy: {} } });
const saida = path.resolve(root, '../outputs/qa-saldo-cartoes');
await mkdir(saida, { recursive: true });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  let geo = false, status = 'PENDENTE', valor = 1000, despesas = null, uploads = [], enviados = [], ajustes = [], extra = 0;
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const cartao = { id: 1, nome: 'Cartão QA', ultimos_quatro: '1234' };
  const saldo = () => ({ saldo_disponivel: valor - (despesas || 0) + extra,
    saldo_validado: valor + extra - (status === 'VALIDADA' ? despesas || 0 : 0), despesas_pendentes: status === 'VALIDADA' ? 0 : despesas || 0, revisao: `rev-${extra}` });
  const contexto = () => ({ ultima_recarga: { id: 1, solicitacao_id: 100, cartao, valor_solicitado: 1000, valor_efetivo: 1000,
    titulo: { id: 1, status: 'QUITADO' }, status_ciclo: 'PRESTACAO_PENDENTE',
    prestacao: { id: 1, status, valor_base: 1000, valor_despesas: despesas, saldo_disponivel_envio: despesas == null ? null : 1000, saldo_remanescente: despesas == null ? null : 1000 - despesas,
      rateios: despesas > 0 ? [{ id: 1, obra_id: 11, valor_rateio: despesas }] : [] } },
    obras_disponiveis: [{ id: 11, codigo: 'ADM', nome: 'Centro administrativo', tipo_centro_custo: 'CENTRO_CUSTO' }],
    documentos_prestacao: uploads.filter(a => a.tipo === 'PRESTACAO_RECARGA'), tipo_documento_prestacao: 'PRESTACAO_RECARGA',
    pode_validar: geo, saldo_cartao: saldo(), saldo_para_prestacao: saldo(), ajustes_saldo: ajustes });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/recargas-cartao/meus-cartoes')) return json({ cartoes: [cartao] });
    if (/\/recargas-cartao\/cartoes\/\d+\/contexto/.test(url.pathname)) return json({ bloqueado: false, saldo_cartao: saldo() });
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100')) return json(contexto());
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100/prestacao')) {
      const body = req.postDataJSON(); enviados.push(body);
      despesas = body.rateios.reduce((s, r) => s + r.valor_rateio, 0); status = 'ENVIADA';
      return json({ recarga: contexto().ultima_recarga });
    }
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100/saldo/ajuste')) {
      const body = req.postDataJSON(); ajustes.push({ id: 1, createdAt: '2026-10-15T15:00:00Z', criado_por: 5, saldo_anterior: 300, ...body });
      extra = body.saldo_informado - 300; return json({ ajuste: ajustes[0] });
    }
    if (url.pathname.endsWith('/anexos/upload')) {
      const tipo = req.postData().includes('EXTRATO_SALDO_CARTAO') ? 'EXTRATO_SALDO_CARTAO' : 'PRESTACAO_RECARGA';
      const anexo = { id: uploads.length + 1, tipo, nome_original: 'Extrato QA.pdf', caminho_arquivo: '/qa.pdf' };
      uploads.push(anexo); return json([anexo]);
    }
    if (url.origin === 'http://127.0.0.1:5299' && !url.pathname.startsWith('/api')) return route.continue();
    return route.abort('blockedbyclient');
  });
  const abrir = async () => {
    await page.goto('http://127.0.0.1:5299/scripts/fixtures/recargasCartoes.html');
    await page.getByRole('button', { name: /Recarga de cartão/ }).click();
  };
  await abrir();
  assert.equal(await page.getByText('Ajustar saldo pelo extrato (GEO)', { exact: true }).count(), 0);
  const prestacao = page.locator('section[aria-labelledby="prestacao-recarga-1"]');
  const enviar = prestacao.getByRole('button', { name: 'Enviar prestação', exact: true });
  await prestacao.getByLabel('Valor do rateio 1').fill('1.001,00');
  assert(await enviar.isDisabled());
  await prestacao.getByLabel('Valor do rateio 1').fill('700,00');
  assert(await enviar.isDisabled(), 'Comprovante continua obrigatorio mesmo com sobra.');
  await prestacao.locator('input[type=file]').setInputFiles({ name: 'Extrato QA.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF QA') });
  await enviar.waitFor({ state: 'visible' });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Enviar prestação')?.disabled);
  await enviar.evaluate(b => { b.click(); b.click(); });
  await page.getByText('ENVIADA', { exact: true }).waitFor();
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].rateios[0].valor_rateio, 700);
  assert.equal(enviados[0].revisao_saldo, 'rev-0');
  assert.match(await prestacao.innerText(), /Sobra:.*300,00/);
  await page.screenshot({ path: path.join(saida, 'obra-gastos-reais-desktop.png'), fullPage: true });
  geo = true; status = 'VALIDADA';
  await abrir();
  await page.getByText('Ajustar saldo pelo extrato (GEO)', { exact: true }).click();
  await page.getByLabel('Saldo disponível real', { exact: true }).fill('400');
  await page.getByLabel('Motivo do ajuste de saldo').fill('Saldo real confirmado pelo GEO');
  await page.getByLabel('Extrato do cartão').setInputFiles({ name: 'Extrato QA.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF QA') });
  await page.getByRole('button', { name: 'Registrar ajuste auditado', exact: true }).click();
  await page.getByText('Ajuste registrado no histórico.', { exact: true }).waitFor();
  assert.equal(ajustes.length, 1); assert.equal(ajustes[0].saldo_informado, 400);
  assert(ajustes[0].chave_idempotencia); assert.equal(ajustes[0].anexo_id, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(saida, 'geo-ajuste-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  geo = false; status = 'PENDENTE'; despesas = null; extra = 0;
  await abrir();
  await prestacao.getByRole('checkbox').check();
  assert.equal(await prestacao.getByLabel('Valor do rateio 1').count(), 0);
  assert(await enviar.isDisabled(), 'Sem gastos exige motivo.');
  await prestacao.locator('textarea').fill('Nao houve utilizacao do saldo neste periodo.');
  await enviar.click();
  await page.getByText('ENVIADA', { exact: true }).waitFor();
  assert.equal(enviados.length, 2); assert.equal(enviados[1].sem_gastos, true); assert.deepEqual(enviados[1].rateios, []);
  assert.deepEqual(erros, []);
  console.log('UI saldo cartoes: gasto parcial/sobra, excesso bloqueado, comprovante, clique duplo, GEO/extrato/historico, privacidade e sem gastos; desktop/mobile aprovados. API ficticia.');
} finally { await browser?.close(); await server.close(); }
