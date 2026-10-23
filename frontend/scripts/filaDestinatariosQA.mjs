import assert from 'node:assert/strict';
import path from 'node:path';

export async function validarDestinatariosFilaUI(page, root) {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5308/qa-fila?destinatarios=1&status=TODOS');
    await page.getByText('TIT-009886', { exact: true }).waitFor();
    assert.equal(await page.locator('th[data-coluna="credor"]').textContent().then(s => s.replace('⋮⋮', '').trim()), 'Credor');
    assert.equal(await page.locator('th[data-coluna="favorecido"]').textContent().then(s => s.replace('⋮⋮', '').trim()), 'Favorecido');
    const nomes = ['Favorecido medicao QA', 'Favorecido manual QA', 'Favorecido solicitacao QA',
      'Favorecido parte QA', 'Favorecido negociacao QA', 'Colaborador dinheiro QA', 'Favorecido não informado', 'Favorecido bancario QA'];
    for (let index = 0; index < nomes.length; index++) {
      const row = page.locator(`[data-fila-linha="${index + 1}"]`);
      assert.equal((await row.locator('[data-coluna="favorecido"]').innerText()).trim(), nomes[index]);
      assert.equal((await row.locator('[data-coluna="credor"]').innerText()).trim(), index === 0 ? 'Credor contrato QA' : index === 5 ? 'Colaborador dinheiro QA' : 'Credor comercial QA');
      assert(!(await row.locator('[data-coluna="favorecido"], [data-coluna="credor"]').allTextContents()).join('').includes('NAO-EXIBIR'));
    }
    assert.equal((await page.locator('[data-fila-linha="1"] [data-coluna="dados"]').innerText()).trim(), 'PIX: 15048245636');
    assert.equal((await page.locator('[data-fila-linha="4"] [data-coluna="dados"]').innerText()).trim(), 'PIX: chave-parte@example.test');
    assert.equal((await page.locator('[data-fila-linha="7"] [data-coluna="favorecido"]').innerText()).trim(), 'Favorecido não informado');
    assert(await page.getByLabel('Selecionar TIT-009886', { exact: true }).isDisabled(), 'Baixa historica continua sem nova selecao');
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // Tabela operacional permanece rolavel, sem tirar as acoes da linha.
    await page.locator('th[data-coluna="favorecido"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, `../outputs/fila-destinatarios-${width}.png`), fullPage: true });
  }
  await page.goto('http://127.0.0.1:5308/qa-fila?destinatarios=1&status=TODOS&readonly=1');
  await page.getByText('TIT-009886', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Registrar baixa', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.__settles.length), 0);
  console.log('OK: fila real 1366/390, credor/favorecido separados sem documento, origens manuais/solicitacao/medicao/partes/negociacao/banco/DP, PIX exato e baixa TIT-009886 preservada. APIs simuladas.');
}
