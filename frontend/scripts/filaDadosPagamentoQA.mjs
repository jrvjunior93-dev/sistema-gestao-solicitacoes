import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const outputs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../outputs');

export async function validarDadosPagamentoFila(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(), errors = [], externas = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5308') return route.continue();
    externas.push(route.request().url()); return route.abort();
  });
  try {
    // Clipboard simulado, sem copiar dados para a area de transferencia real.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { if (window.__denyCopy) throw new Error('negado'); window.__copied = text; }
      } });
    });
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://127.0.0.1:5308/qa-fila?dados=1&massa=1&status=TODOS');
      const opener = page.getByRole('button', { name: 'Ver dados para pagamento de TIT-MASSA-21', exact: true });
      await opener.scrollIntoViewIfNeeded();
      await page.getByLabel('Valor pago de TIT-MASSA-21', { exact: true }).fill('213.00');
      await page.getByLabel('Selecionar TIT-MASSA-21', { exact: true }).check();
      for (const fechar of ['Fechar', 'Escape', 'fora']) {
        await opener.click();
        const modal = page.getByRole('dialog', { name: 'Dados para pagamento de TIT-MASSA-21', exact: true });
        await modal.waitFor();
        const posicao = await page.evaluate(() => ({ y: scrollY, x: document.querySelector('.resizable-table-scroll').scrollLeft }));
        const text = modal.getByLabel('Dados completos para pagamento', { exact: true });
        const completo = await text.inputValue();
        assert(completo.length > 6000 && completo.includes('@EXEMPLO.COM +'));
        assert(await text.getAttribute('readonly') !== null);
        await modal.getByRole('button', { name: 'Copiar dados', exact: true }).click();
        await modal.getByRole('status').getByText('Dados copiados.', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__copied), completo);
        const rect = await modal.locator('.card').boundingBox();
        assert(rect.width <= width && rect.y >= 0 && rect.y + rect.height <= 901);
        await page.screenshot({ path: path.join(outputs, `fila-dados-pagamento-${width}.png`) });
        if (fechar === 'Escape') await page.keyboard.press('Escape');
        else if (fechar === 'fora') await modal.click({ position: { x: 2, y: 2 } });
        else await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
        await modal.waitFor({ state: 'detached' });
        await page.waitForFunction(p => Math.abs(scrollY-p.y)<2 && Math.abs(document.querySelector('.resizable-table-scroll').scrollLeft-p.x)<2, posicao);
        assert.equal(await page.getByLabel('Valor pago de TIT-MASSA-21', { exact: true }).inputValue(), '213.00');
        assert(await page.getByLabel('Selecionar TIT-MASSA-21', { exact: true }).isChecked());
        assert.equal(await opener.evaluate(el => el === document.activeElement), true);
      }
      assert.equal(await page.evaluate(() => window.__settles.length), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    // Consulta tambem disponivel sem permissao de baixar; fallback de copia.
    await page.goto('http://127.0.0.1:5308/qa-fila?dados=1&readonly=1&status=TODOS');
    await page.getByRole('button', { name: 'Ver dados para pagamento de TIT-QA', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Dados para pagamento de TIT-QA', exact: true });
    await page.evaluate(() => { window.__denyCopy = true; });
    await modal.getByRole('button', { name: 'Copiar dados', exact: true }).click();
    await modal.getByRole('status').getByText('Selecione o texto abaixo e copie manualmente.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.goto('http://127.0.0.1:5308/qa-fila?rh=pix');
    await page.getByText('PIX EMAIL: responsavel@example.test', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Ver dados para pagamento/ }).count(), 0, 'Dados curtos preservam exibicao direta');
    assert.deepEqual(errors, []); assert.deepEqual(externas, []);
    console.log('OK: dados completos/copia integral, desktop/mobile, Fechar/Escape/fora, foco/rolagem/rascunho/selecao preservados, somente leitura e clipboard negado. Sem baixa/API externa.');
  } finally { await context.close(); }
}
