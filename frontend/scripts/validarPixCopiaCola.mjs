// Modal real e APIs simuladas; bloqueia qualquer acesso externo.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PIX_TIPOS_CHAVE, pixTipoLabel } from '../src/utils/pix.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5307, saida = path.resolve(root, '../outputs/qa-pix-copia-cola');
await mkdir(saida, { recursive: true });
// Catalogo aplicado a todas as telas com seletor de tipo Pix, nao apenas o modal.
for (const arquivo of ['pages/SolicitacaoDetalhe/FinanceiroCard.jsx', 'pages/FinanceiroTituloNovo.jsx', 'pages/FinanceiroTituloEditar.jsx',
  'pages/FinanceiroCadastros.jsx', 'pages/Parceiros.jsx', 'pages/NovaSolicitacao.jsx', 'pages/RhDpPessoal.jsx',
  'modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx']) {
  const fonte = await readFile(path.join(root, 'src', arquivo), 'utf8');
  assert.match(fonte, /import .*PIX_(TIPOS|OPCOES)_CHAVE.*utils\/pix/);
  assert.match(fonte, /PIX_TIPOS_CHAVE.*\.map|PIX_TIPOS_CHAVE\.map/);
}
assert(PIX_TIPOS_CHAVE.includes('COPIA_COLA'));
assert.equal(pixTipoLabel('COPIA_COLA'), 'Copia e Cola');
const freteFonte = await readFile(path.join(root, 'src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx'), 'utf8');
const maskFonte = freteFonte.match(/function maskPixKey\(value, type\) \{[\s\S]*?\n\}/)[0];
const maskPixKey = vm.runInNewContext(`(${maskFonte})`);
assert.equal(maskPixKey('ABC:def@EMAIL.com\n+ /' + 'xY'.repeat(200), 'COPIA_COLA'), 'ABC:def@EMAIL.com\n+ /' + 'xY'.repeat(200));
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, proxy: {} } });
await server.listen();
let browser, page;
const erros = [], inesperadas = [], favorecidos = [], titulos = [];
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => erros.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/financeiro/favorecidos') && request.method() === 'POST') {
      const dados = request.postDataJSON(); favorecidos.push(dados); return json({ id: favorecidos.length, ...dados });
    }
    if (url.pathname.endsWith('/financeiro/favorecidos')) return json([]);
    if (url.pathname.endsWith('/solicitacoes/100/gerar-conta')) { titulos.push(request.postDataJSON()); return json({ id: titulos.length, status: 'ABERTO' }); }
    if (url.pathname.endsWith('/solicitacoes/100/titulos-financeiros')) return json([]);
    if (url.pathname.endsWith('/financeiro/formas-pagamento')) return json([{ id: 1, nome: 'Pix QA', tipo: 'PIX', codigo: 'PIX', ativo: true }]);
    if (url.pathname.endsWith('/financeiro/cartoes')) return json([]);
    if (url.pathname.endsWith('/financeiro/categorias')) return json([{ id: 1, nome: 'Material QA', tipo: 'PAGAR', ativo: true, dre_grupo: 'CUSTOS' }]);
    if (url.pathname.endsWith('/empresas-grupo')) return json([{ id: 1, nome: 'Empresa QA', ativo: true }]);
    if (url.pathname.endsWith('/obras')) return json([{ id: 1, nome: 'Obra QA', empresa_grupo_id: 1 }]);
    if (url.pathname.endsWith('/parceiros/1')) return json({ id: 1, nome: 'Credor QA', fornecedor: true, ativo: true, cpf_cnpj: '52998224725' });
    if (url.pathname.endsWith('/parceiros')) return json([]);
    if (url.origin === `http://127.0.0.1:${port}` && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/solicitacoes/')) return route.continue();
    inesperadas.push(url.pathname); return route.abort('blockedbyclient');
  });
  for (const [largura, texto] of [[1366, 'Texto Livre ABC:def/XYZ + ?= @ $'], [375, '000201ABC:Pix/' + 'aB:0123456789/'.repeat(80)]]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/pixCopiaCola.html`);
    await page.getByRole('button', { name: 'Criar Título', exact: true }).click();
    await page.getByLabel('Categoria financeira deste título').fill('Material');
    await page.getByRole('option', { name: /Material QA/ }).click();
    await page.getByLabel(/^Forma de pagamento/).selectOption('1');
    await page.getByLabel('Preparar PIX', { exact: true }).check();
    await page.getByLabel(/^Tipo da chave PIX/).selectOption({ label: 'Copia e Cola' });
    const chave = page.getByLabel(/^Chave PIX/);
    await chave.fill(texto);
    assert.equal(await chave.inputValue(), texto);
    assert.equal(await chave.getAttribute('maxLength'), null);
    await chave.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(saida, `${largura}.png`) });
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.locator('#form-gerar-conta').waitFor({ state: 'detached' });
    assert.equal(favorecidos.at(-1).pix_chave, texto);
    assert.equal(favorecidos.at(-1).pix_tipo_chave, 'COPIA_COLA');
    assert.equal(titulos.at(-1).pagamentos[0].payment_beneficiary_id, favorecidos.length);
  }
  // Duas instrucoes distintas nao podem reutilizar o mesmo favorecido por uma
  // normalizacao que elimina caixa, simbolos ou extrai apenas os digitos.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/pixCopiaCola.html`);
  await page.getByRole('button', { name: 'Criar Título', exact: true }).click();
  await page.getByLabel('Gerar múltiplos títulos', { exact: true }).check();
  await page.getByRole('button', { name: 'Adicionar forma de pagamento', exact: true }).click();
  const chaves = ['ABC:1234567890/XYZ + ?', 'abc:1234567890/xyz + ?'];
  const quantAntes = favorecidos.length;
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Categoria financeira deste título').nth(i).fill('Material');
    await page.getByRole('option', { name: /Material QA/ }).click();
    await page.getByLabel(/^Forma de pagamento/).nth(i).selectOption('1');
    await page.locator('.financeiro-forma-pagamento-parcela').nth(i).getByLabel('Valor', { exact: true }).fill('100,00');
    await page.getByLabel('Preparar PIX', { exact: true }).nth(i).check();
    await page.getByLabel(/^Tipo da chave PIX/).nth(i).selectOption('COPIA_COLA');
    await page.getByLabel(/^Chave PIX/).nth(i).fill(chaves[i]);
  }
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.locator('#form-gerar-conta').waitFor({ state: 'detached' });
  assert.equal(favorecidos.length, quantAntes + 2);
  assert.deepEqual(favorecidos.slice(-2).map(f => f.pix_chave), chaves);
  assert.notEqual(titulos.at(-1).pagamentos[0].payment_beneficiary_id, titulos.at(-1).pagamentos[1].payment_beneficiary_id);
  assert.deepEqual(erros, []); assert.deepEqual(inesperadas, []);
  console.log('OK: 8 telas com catalogo Pix; preparar Pix real, Copia e Cola livre/longos, payload integro e titulo vinculado em desktop/mobile. Sem API externa.');
} catch (error) {
  if (page) { console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.join(saida, 'falha.png'), fullPage: true }); }
  throw error;
} finally { await browser?.close(); await server.close(); }
