// Tela/servico reais com HTTP interceptado; sem DB, gravacao ou ambiente real.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.resolve(root, '../outputs/qa-recarga-regularizacao');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5304, strictPort: true, proxy: {} } });
await mkdir(saida, { recursive: true }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 960 } });
  const erros = [], envios = [], queries = [];
  let modo = 'sem-pagamento', erroEnvio = false, atrasar = false, liberar;
  page.on('pageerror', e => erros.push(e.message));
  const item = { id: 31, codigo: 'SOL-31', obra: 'ESCOLA ECOPORANGA', cartoes: 'Joao · final 1234', encerrada: false };
  const ctx = () => ({ id: 31, codigo: 'SOL-31', revisao: 'a'.repeat(64), encerrada: false, pode_regularizar: modo !== 'impedido',
    impedimento: modo === 'impedido' ? 'Existe envio bancário ativo. Solicite ao Financeiro cancelar esse processamento.' : null,
    acao: modo === 'pago' ? 'RECUPERAR_PRESTACAO' : 'ENCERRAR_SEM_PAGAMENTO',
    descricao: modo === 'pago' ? 'Recuperar a solicitação original no GEO para prestar contas dos pagamentos. Nenhum pagamento será alterado.' : 'Encerrar todas as recargas e cancelar títulos sem pagamento. Histórico e anexos preservados.',
    recargas: [{ id: 7, cartao: 'Joao · final 1234', titulo_id: 80, titulo_status: modo === 'pago' ? 'QUITADO' : 'ABERTO',
      valor_pago: modo === 'pago' ? 100 : 0, valor_saldo: modo === 'pago' ? 0 : 100, prestacao_status: modo === 'pago' ? 'ENVIADA' : 'SEM PRESTACAO', tratamento: modo === 'pago' ? 'Prestar contas' : 'Encerrar' }] });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/recargas-cartao/regularizacao')) { queries.push(url.search); return json({ items: [item], proximo_cursor: null }); }
    if (url.pathname.endsWith('/recargas-cartao/regularizacao/31')) {
      if (req.method() === 'GET') return json(ctx());
      assert.equal(req.method(), 'POST'); envios.push(req.postDataJSON());
      if (atrasar) await new Promise(resolve => { liberar = resolve; });
      if (erroEnvio) return json({ error: 'O financeiro mudou. Atualize a consulta antes de confirmar.' }, 409);
      return json({ solicitacao_id: 31, codigo: 'SOL-31', recuperada: modo === 'pago', mensagem: modo === 'pago' ? 'Solicitação original recuperada no GEO.' : 'Recarga encerrada sem pagamento. Histórico preservado.' });
    }
    if (url.origin === 'http://127.0.0.1:5304' && !url.pathname.startsWith('/api')) return route.continue();
    return route.abort('blockedbyclient');
  });
  const abrir = async () => {
    await page.goto('http://127.0.0.1:5304/scripts/fixtures/recargasRegularizacao.html');
    await page.getByRole('button', { name: 'Conferir SOL-31', exact: true }).click();
    await page.getByRole('region', { name: 'Conferência SOL-31' }).waitFor();
  };
  await abrir();
  assert.deepEqual(await page.evaluate(() => window.__permissoesQA), [true, true, true, false, false, false]);
  const encerrar = page.getByRole('button', { name: 'Encerrar recarga sem pagamento', exact: true });
  assert(await encerrar.isDisabled()); assert.equal(envios.length, 0, 'abrir/consultar nunca grava');
  await page.getByLabel('Motivo da regularização *', { exact: true }).fill('Exclusão de teste conferida pelo GEO');
  assert(await encerrar.isDisabled());
  await page.getByLabel('Conferi o tratamento de todos os cartões desta solicitação.').check();
  await page.screenshot({ path: path.join(saida, 'sem-pagamento-desktop.png'), fullPage: true });
  erroEnvio = true; await encerrar.click();
  await page.getByRole('alert').filter({ hasText: 'O financeiro mudou' }).waitFor();
  await page.screenshot({ path: path.join(saida, 'erro-preservado.png'), fullPage: true });
  assert.equal(await page.getByLabel('Motivo da regularização *', { exact: true }).inputValue(), 'Exclusão de teste conferida pelo GEO');
  erroEnvio = false; atrasar = true; await encerrar.click();
  await page.getByRole('button', { name: 'Regularizando...' }).waitFor();
  assert.equal(envios[0].chave_idempotencia, envios[1].chave_idempotencia, 'retry repete chave, nao duplica acao');
  await page.getByRole('region', { name: 'Conferência SOL-31' }).locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  assert.equal(envios.length, 2); liberar(); atrasar = false;
  await page.getByText('Recarga encerrada sem pagamento. Histórico preservado.', { exact: true }).waitFor();
  assert.equal(await encerrar.count(), 0);
  modo = 'pago'; await abrir();
  await page.getByLabel('Motivo da regularização *', { exact: true }).fill('Recuperar pagamento existente para prestar contas');
  await page.getByLabel('Conferi o tratamento de todos os cartões desta solicitação.').check();
  await page.getByRole('button', { name: 'Recuperar para prestação de contas', exact: true }).click();
  const link = page.getByRole('link', { name: 'Abrir prestação de contas · SOL-31' }); await link.waitFor();
  assert.equal(await link.getAttribute('href'), '/solicitacoes/31');
  assert.equal(envios[2].revisao, 'a'.repeat(64)); assert.equal('valor_pago' in envios[2], false);
  modo = 'impedido'; await abrir();
  assert.equal(await page.getByRole('button', { name: 'Encerrar recarga sem pagamento', exact: true }).count(), 0);
  await page.getByText(/Existe envio bancário ativo/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(saida, 'impedimento-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem overflow mobile');
  await page.getByLabel('Código da solicitação', { exact: true }).fill('SOL-31');
  await page.getByRole('button', { name: 'Consultar lista', exact: true }).click();
  await page.getByRole('button', { name: 'Limpar filtro', exact: true }).waitFor(); assert(queries.some(q => q.includes('codigo=SOL-31')));
  assert.deepEqual(erros, []);
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /return canRegularizarRecarga\(user\) \? <RecargasRegularizacao/);
  const nav = await readFile(path.join(root, 'src/navigation/navigationConfig.jsx'), 'utf8');
  assert.match(nav, /to: '\/recargas-cartao\/regularizacao', can: canRegularizarRecarga/);
  console.log('UI regularizacao: consulta sem gravacao, confirmacao/motivo, negativos Financeiro/ACL, revisao/retry e clique duplo, recuperacao com link original, filtro e desktop/mobile aprovados. API ficticia.');
} finally { await browser?.close(); await server.close(); }
