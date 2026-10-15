// API isolada: sem criar solicitacao, sem banco ou alteracao de registros reais.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagina = await readFile(path.join(root, 'src/pages/NovaSolicitacao.jsx'), 'utf8');
assert.match(pagina, /usaFluxoRecargaCartao && \(!cartaoRecargaId \|\| recargaCartaoContexto\?\.bloqueado\)/);
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5300, strictPort: true, proxy: {} } });
const saida = path.resolve(root, '../outputs/qa-recarga-contexto-excluido');
await mkdir(saida, { recursive: true }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  let modo = 'erro', liberar;
  const erros = [], consultas = [];
  page.on('pageerror', e => erros.push(e.message));
  const saldo = { saldo_validado: 0, saldo_disponivel: 0, despesas_pendentes: 0, revisao: 'qa' };
  const primeira = { ultima_recarga: null, bloqueado: false, saldo_cartao: saldo };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/recargas-cartao/meus-cartoes')) return json({ cartoes: [{ id: 1, nome: 'Joao', ultimos_quatro: '1234' }] });
    if (/\/recargas-cartao\/cartoes\/1\/contexto/.test(url.pathname)) {
      consultas.push(modo);
      if (modo === 'erro') return json({ error: 'Solicitacao nao encontrada.' }, 404);
      if (modo === 'carregando') await new Promise(resolve => { liberar = resolve; });
      if (modo === 'excluida-pendente') return json({ ...primeira, bloqueado: true, recarga_anterior_indisponivel: true,
        motivo_bloqueio: 'Existe recarga vinculada a uma solicitacao excluida com titulo ou prestacao pendente. Solicite ao GEO a regularizacao antes de criar outra recarga.' });
      if (modo === 'ativa') return json({ ...primeira, bloqueado: true, motivo_bloqueio: 'A recarga anterior ainda possui pagamento pendente.',
        ultima_recarga: { id: 8, valor_solicitado: 100, titulo: { status: 'ABERTO' }, solicitacao: { id: 8, codigo: 'SOL-8', area_responsavel: 'GEO' } } });
      return json(primeira);
    }
    if (url.pathname.endsWith('/recargas-cartao/solicitacoes/100')) return json({ ultima_recarga: null });
    if (url.origin === 'http://127.0.0.1:5300' && !url.pathname.startsWith('/api')) return route.continue();
    return route.abort('blockedbyclient');
  });
  const criar = page.getByRole('button', { name: 'Criar Solicitação', exact: true });
  const selecionar = async () => {
    await page.goto('http://127.0.0.1:5300/scripts/fixtures/recargasCartoes.html');
    await page.getByRole('checkbox').check();
    await page.getByLabel('Valor da recarga Joao').fill('5000');
  };
  await selecionar();
  await page.getByText('Não foi possível consultar', { exact: true }).waitFor();
  assert(await criar.isDisabled());
  assert.equal(await page.getByText('Sem recarga anterior', { exact: true }).count(), 0);
  assert.match(await page.getByTestId('motivo-bloqueio').innerText(), /Tentar novamente/);
  modo = 'primeira';
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByText('Sem recarga anterior', { exact: true }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Criar Solicitação').disabled);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.getByLabel('Valor da recarga Joao').inputValue(), '5000', 'Retry nao pode apagar o valor digitado.');
  await page.screenshot({ path: path.join(saida, 'primeira-recarga-desktop.png'), fullPage: true });
  modo = 'excluida-pendente'; await selecionar();
  await page.getByText('Recarga anterior indisponível', { exact: true }).waitFor();
  assert(await criar.isDisabled());
  assert.equal(await page.getByRole('alert').count(), 0, 'Pendencia identificada e aviso operacional, nao erro HTTP.');
  assert.match(await page.getByLabel('Contexto do cartão').locator('[role="status"]').innerText(), /GEO.*regularizacao/);
  assert.equal(await page.getByText('Sem recarga anterior', { exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(saida, 'pendencia-excluida-mobile.png'), fullPage: true });
  modo = 'ativa'; await selecionar();
  await page.getByText(/Continue pela solicitação anterior.*SOL-8/).waitFor();
  assert(await criar.isDisabled());
  modo = 'carregando'; await selecionar();
  await page.getByText('Consultando cartão...', { exact: true }).waitFor();
  assert(await criar.isDisabled());
  liberar();
  await page.getByText('Sem recarga anterior', { exact: true }).waitFor();
  assert.deepEqual(erros, []); assert(consultas.length >= 5);
  console.log('UI contexto recarga: primeira sem alerta/criacao habilitada; erro real/consulta em voo bloqueados; retry preserva valor; excluida pendente e ativa explicadas; desktop/mobile aprovados. API ficticia.');
} finally { await browser?.close(); await server.close(); }
