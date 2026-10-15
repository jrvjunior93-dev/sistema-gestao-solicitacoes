import assert from 'node:assert/strict';
export async function validarFiltrosDpFila(page) {
  await page.goto('http://127.0.0.1:5308/qa-fila?filtros-dp=1');
  await page.getByText('TIT-DP-DINHEIRO', { exact: true }).waitFor();
  assert.equal(await page.locator('thead th[data-coluna="recebimento_dp"]').count(), 1);
  assert.equal(await page.locator('thead th[data-coluna="empresa_colaborador"]').count(), 1);
  await page.getByLabel('Selecionar TIT-DP-DINHEIRO', { exact: true }).check();
  await page.getByLabel('Origem dos títulos', { exact: true }).selectOption('RH_DP');
  await page.getByText('TIT-EXTERNO', { exact: true }).waitFor({ state: 'hidden' });
  assert(!(await page.getByLabel('Selecionar TIT-DP-DINHEIRO', { exact: true }).isChecked()), 'Trocar filtro limpa selecao de baixa');
  await page.getByLabel('Empresa do título / colaborador', { exact: true }).selectOption('3');
  await page.getByText('TIT-DP-PIX', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByLabel('Credor', { exact: true }).selectOption('11');
  await page.getByLabel('Recebimento DP', { exact: true }).selectOption('DINHEIRO');
  await page.waitForFunction(() => window.__filterQueries?.at(-1)?.recebimento_dp === 'DINHEIRO');
  const row = page.locator('[data-fila-linha="1"]');
  assert((await row.innerText()).includes('Dinheiro'));
  assert((await row.innerText()).includes('Empresa colaborador QA'));
  assert((await row.innerText()).includes('Recebimento em dinheiro'));
  assert.equal(await page.evaluate(() => window.__settles.length), 0, 'Filtrar nao registra baixa');
  assert.equal(new URL(page.url()).searchParams.get('empresa_id'), '3');
  assert.equal(new URL(page.url()).searchParams.get('credor_id'), '11');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.getByLabel('Recebimento DP', { exact: true }).isVisible());
    assert(await page.getByLabel('Credor', { exact: true }).isVisible());
    await page.screenshot({ path: new URL('../../outputs/fila-filtros-dp-' + width + '.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Limpar filtros dos títulos', exact: true }).click();
  await page.getByText('TIT-EXTERNO', { exact: true }).waitFor();
  console.log('Fila UI: origem DP, empresa do colaborador separada da pagadora, credor/recebimento, URL, selecao limpa, dinheiro e filtros desktop/mobile sem baixa aprovados.');
}
