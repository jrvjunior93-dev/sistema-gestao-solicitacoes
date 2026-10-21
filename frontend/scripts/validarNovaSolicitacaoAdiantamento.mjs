// Pagina real, transporte interceptado; sem backend, escrita ou upload real.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
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
  const favorecidoSegundo = { ...favorecido, id: 7, nome: 'Segundo QA', pix_chave_fixa_1: 'segundo@pix' };
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
    if (url.pathname.endsWith('/parceiros')) return json([favorecido, favorecidoSegundo].filter(p => p.nome.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())));
    if (url.pathname.endsWith('/apropriacoes')) return json([]);
    if (url.pathname.endsWith('/centros-custo/30/obras-distribuicao')) return json({ regra: 'TODAS', obras: [{ id: 2, codigo: '02', nome: 'Obra privada' }] });
    if (url.pathname.endsWith('/solicitacoes') && req.method() === 'POST') { enviados.push(req.postDataJSON()); return json({ id: 101, codigo: 'SOL-QA' }, 201); }
    if (url.origin === `http://127.0.0.1:${port}` && !url.pathname.startsWith('/api')) return route.continue();
    unexpected.push(url.pathname); return route.abort('blockedbyclient');
  });
  for (const comDistribuicaoResidual of [false, true]) {
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/adiantamento.html?nova`);
  await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Administrativo');
  await page.getByRole('button', { name: /Administrativo.*ADM/ }).click();
  await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
  if (comDistribuicaoResidual) await page.getByRole('radio', { name: /TODAS/ }).check();
  await page.locator('[name="tipo_sub_id"]').selectOption('7');
  assert.equal(await page.getByText('Distribuição gerencial por obra / centro de custo', { exact: true }).count(), 0);
  await page.locator('[name="tipo_sub_id"]').selectOption('8');
  assert.equal(await page.getByText('Distribuição gerencial por obra / centro de custo', { exact: true }).count(), 1, 'Despesa normal conserva distribuicao');
  assert.equal(await page.getByRole('radio', { name: /TODAS/ }).isChecked(), comDistribuicaoResidual, 'Troca de subtipo nao apaga distribuicao da despesa normal');
  await page.locator('[name="tipo_sub_id"]').selectOption('7');
  await page.locator('[name="forma_pagamento_id"]').selectOption('1');
  await page.getByRole('combobox', { name: /Favorecido do pagamento/ }).fill('Favorecido');
  await page.getByRole('button', { name: /Favorecido QA/ }).click();
  await page.locator('[name="valor"]').fill('1.000,00');
  await page.locator('[name="descricao"]').fill('Adiantamento para despesas administrativas');
  await page.locator('[name="data_vencimento"]').fill('01/12/2099');
  const dados = page.getByTestId('nova-solicitacao-dados');
  const pagamento = page.getByTestId('nova-solicitacao-pagamento');
  assert.equal(await dados.locator('[name="tipo_sub_id"]').count(), 1);
  assert.equal(await dados.locator('[name="data_vencimento"]').count(), 1);
  assert.equal(await dados.locator('[name="forma_pagamento_id"]').count(), 0);
  assert.equal(await pagamento.locator('[name="valor"]').count(), 1);
  assert.equal(await pagamento.locator('[name="forma_pagamento_id"]').count(), 1);
  const adicionar = pagamento.getByRole('button', { name: 'Adicionar novo favorecido', exact: true });
  assert.equal(await adicionar.count(), 1, 'Um unico gatilho para adicionar');
  assert.equal((await adicionar.innerText()).trim(), '', 'Gatilho somente icone');
  assert.equal(await adicionar.getAttribute('title'), 'Adicionar novo favorecido');
  assert.equal(await adicionar.evaluate(el => el.type === 'button' && !el.closest('label') && Boolean(el.parentElement.querySelector('[aria-label="Cadastrar favorecido"]')) && Boolean(el.parentElement.querySelector('input[role="combobox"]'))), true, 'Icone junto ao campo/cadastro, fora do label');
  if (!comDistribuicaoResidual) {
    const saida = path.resolve(root, '../outputs/qa-icone-favorecido-20261012');
    await mkdir(saida, { recursive: true });
    await page.screenshot({ path: path.join(saida, 'adiantamento-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sem rolagem horizontal no mobile');
    await page.screenshot({ path: path.join(saida, 'adiantamento-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  if (comDistribuicaoResidual) {
    await page.getByRole('button', { name: 'Adicionar novo favorecido', exact: true }).click();
    const partes = page.getByTestId('parte-favorecido');
    assert.equal(await partes.nth(0).getByLabel('Valor do favorecido 1 *', { exact: true }).inputValue().then(v => v.replace(/[^\d,]/g, '')), '1000,00', 'Valor informado antes do + e preservado');
    await partes.nth(1).getByRole('combobox', { name: 'Favorecido 2 *', exact: true }).fill('Segundo');
    await partes.nth(1).getByRole('button', { name: /^Segundo QA/ }).click();
    await partes.nth(1).getByRole('combobox', { name: /^Forma de pagamento do favorecido 2/ }).selectOption('1');
    await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('200,00');
    assert.equal((await pagamento.locator('[name="valor"]').inputValue()).replace(/[^\d,]/g, ''), '1200,00');
    const saida = path.resolve(root, '../outputs/qa-icone-favorecido-20261012');
    await page.screenshot({ path: path.join(saida, 'favorecidos-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(saida, 'favorecidos-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  assert.equal(await page.getByText('Categoria financeira', { exact: true }).count(), 0, 'Categoria pertence ao GEO, nao ao solicitante');
  await page.getByRole('button', { name: /criar solicitação|enviar solicitação|salvar solicitação/i }).click();
  await page.waitForURL('**/solicitacoes/101').catch(async error => {
    console.error({ enviados, unexpected, errors, invalidos: await page.locator('input:invalid,select:invalid,textarea:invalid').evaluateAll(inputs => inputs.map(i => ({ name: i.name, valor: i.value, motivo: i.validationMessage }))), tela: (await page.locator('body').innerText()).slice(-3000) }); throw error;
  });
  const enviado = enviados.at(-1);
  assert.equal(enviados.length, comDistribuicaoResidual ? 2 : 1); assert.equal(enviado.tipo_sub_id, '7'); assert.equal(enviado.favorecido_id, '6');
  assert.equal(Number(enviado.valor), comDistribuicaoResidual ? 1200 : 1000); assert.equal(enviado.forma_pagamento_id, '1');
  if (comDistribuicaoResidual) assert.deepEqual(enviado.pagamentos_favorecidos.map(p => [p.favorecido_id, p.valor]), [[6, 1000], [7, 200]]);
  assert(!('distribuicao_centro_custo' in enviado), 'Adiantamento nao envia distribuicao residual do tipo pai'); assert(!enviado.recargas_cartoes);
  }
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('OK: Nova Solicitacao real com adiantamento sem distribuicao antecipada/residual; despesa normal conserva distribuicao; campos obrigatorios, favorecido/PIX e total sem categoria antecipada. Sem banco/rede externa.');
} finally { await browser?.close(); await server.close(); }
