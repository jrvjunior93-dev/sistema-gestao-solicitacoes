import assert from 'node:assert/strict';
export async function validarRolagemFila(page) {
  const base = 'http://127.0.0.1:5308/qa-fila?volume=1&rolagem=1';
  const alternar = () => page.getByRole('button', { name: /Modo atual:/ });
  const total = n => page.getByText(`${n} de 650 registro(s) carregados`, { exact: true });
  const scrollMais = async (n) => {
    await page.locator('[data-rolagem-sentinela]').scrollIntoViewIfNeeded();
    await total(n).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  if (!process.argv.includes('--concorrencia')) {
  for (const status of ['PENDENTE','PENDENTE_COMPROVANTE','NAO_PAGO','DIVERGENTE','EM_EDICAO','BAIXADO','RESOLVIDO','TODOS']) {
    await page.goto(base + '&status=' + status);
    await total(50).waitFor();
    assert.equal(await alternar().innerText(), 'Rolagem');
    await scrollMais(100);
    assert.equal(await page.locator('[data-fila-linha]').count(), 100);
    assert.deepEqual(await page.evaluate(() => window.__filterQueries.map(q => q.pagina)), [1, 2]);
  }
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base); await total(50).waitFor();
    await page.getByLabel('Selecionar TIT-VOL-1', { exact: true }).check();
    await page.locator('[data-fila-linha="1"] [data-coluna="valor"] input').fill('150');
    await scrollMais(100);
    assert.equal(await page.locator('[data-fila-linha="1"] [data-coluna="valor"] input').inputValue(), '150');
    await page.getByLabel('Selecionar TIT-VOL-51', { exact: true }).check();
    await page.evaluate(() => window.scrollTo(0, 0));
    await alternar().click();
    await page.getByText('650 registro(s) · Página 1 de 13', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Baixa em massa (2)', exact: true }).isEnabled());
    await page.getByRole('button', { name: 'Próxima', exact: true }).click();
    await page.getByText('650 registro(s) · Página 2 de 13', { exact: true }).waitFor();
    assert(await page.getByLabel('Selecionar TIT-VOL-51', { exact: true }).isChecked());
    await alternar().click(); await total(50).waitFor();
    await scrollMais(100);
    assert.equal(await page.locator('[data-fila-linha="1"] [data-coluna="valor"] input').inputValue(), '150');
    assert(await page.getByLabel('Selecionar TIT-VOL-1', { exact: true }).isChecked());
    assert(await page.getByLabel('Selecionar TIT-VOL-51', { exact: true }).isChecked());
    await page.getByLabel('Selecionar todos os elegíveis carregados', { exact: true }).check();
    assert.equal(await page.locator('tbody input[type=checkbox]:checked').count(), 100);
    await page.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
    assert.equal(await page.locator('tbody input[type=checkbox]:checked').count(), 0);
    await page.getByLabel('Selecionar TIT-VOL-1', { exact: true }).check();
    await page.getByLabel('Selecionar TIT-VOL-51', { exact: true }).check();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Anexar mesmo comprovante (2)', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Anexar mesmo comprovante', exact: true });
    await modal.getByLabel('Comprovante compartilhado', { exact: true }).setInputFiles({ name: 'rolagem.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-QA') });
    await modal.getByRole('button', { name: 'Anexar aos 2 selecionados', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => window.__shared.ids), [1, 51]);
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
    await total(100).waitFor();
    for (let n = 150; n <= 600; n += 50) await scrollMais(n);
    await page.locator('[data-rolagem-sentinela]').scrollIntoViewIfNeeded();
    await page.getByText('Fim da lista · 650 registro(s)', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-fila-linha]').count(), 650);
    assert.equal(await page.locator('[data-fila-linha="501"]').count(), 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`../../outputs/fila-rolagem-${width}.png`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: false });
  }
  // Falha ao buscar o proximo lote conserva dados e selecao, sem repeticao automatica.
  await page.goto(base); await total(50).waitFor();
  await page.getByLabel('Selecionar TIT-VOL-1', { exact: true }).check();
  await page.evaluate(() => { window.__volumeFail = 503; });
  await page.locator('[data-rolagem-sentinela]').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).waitFor();
  assert.equal(await page.locator('[data-fila-linha]').count(), 50);
  assert(await page.getByLabel('Selecionar TIT-VOL-1', { exact: true }).isChecked());
  await page.evaluate(() => { window.__volumeFail = 0; });
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).click();
  await total(100).waitFor();
  await page.evaluate(() => { window.__volumeFail = 403; });
  await page.locator('[data-rolagem-sentinela]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('[data-fila-linha]'));
  assert.equal(await page.getByRole('button', { name: 'Baixa em massa (1)', exact: true }).count(), 0);
  }
  // Alterar card durante uma carga atrasada nao incorpora a resposta anterior.
  await page.goto(base); await total(50).waitFor();
  await page.evaluate(() => { window.__volumeDelay = 350; });
  await page.locator('[data-rolagem-sentinela]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => window.__filterQueries.some(q => q.pagina === 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel('Status', { exact: true }).fill('Baixados');
  await page.getByRole('button', { name: 'Baixados', exact: true }).click();
  await total(50).waitFor({ timeout: 6000 }).catch(async error => {
    console.log('Diagnostico QA de consulta atrasada:', await page.evaluate(() => ({ queries: window.__filterQueries,
      linhas: document.querySelectorAll('[data-fila-linha]').length, texto: document.body.innerText.slice(-1500), y: window.scrollY })));
    throw error;
  });
  assert.equal(await page.locator('[data-fila-linha]').count(), 50);
  assert((await page.locator('[data-fila-linha="1"]').innerText()).includes('BAIXADO'));
  assert.equal(await page.getByRole('button', { name: 'Registrar baixa', exact: true }).count(), 0);
  // Escolha sobrevive ao reload; nao e necessario refazer em cada card.
  await alternar().click();
  await page.getByText('650 registro(s) · Página 1 de 13', { exact: true }).waitFor();
  await page.goto(base + '&persistir-modo=1');
  await page.getByText('650 registro(s) · Página 1 de 13', { exact: true }).waitFor();
  await alternar().click(); await total(50).waitFor();
  await page.goto(base + '&persistir-modo=1'); await total(50).waitFor();
  await page.addInitScript(() => { window.IntersectionObserver = undefined; });
  await page.goto(base); await total(50).waitFor();
  await page.getByRole('button', { name: 'Carregar mais pagamentos', exact: true }).click();
  await total(100).waitFor();
  console.log(process.argv.includes('--concorrencia')
    ? 'Rolagem: resposta atrasada isolada por card, preferencia apos reload e fallback sem observer aprovados.'
    : 'Rolagem real: 8 recortes, 650 titulos, desktop/mobile, selecao/rascunho, limpar todos, anexo sem baixa, retry/403, concorrencia, preferencia e fallback aprovados.');
}
