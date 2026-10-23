import assert from 'node:assert/strict';
import path from 'node:path';

export async function validarTituloDadosPagamentoUI(page, goto, alternate, output) {
  const campo = label => page.locator('.app-stat').filter({ has: page.getByText(label, { exact: true }) }).locator('.app-stat-valor');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [modo, nome, instrucao] of [
      ['medicao', 'Favorecido medicao QA', '15048245636'],
      ['solicitacao', 'Favorecido solicitacao QA', 'chave-solicitacao@example.test'],
      ['manual', 'Favorecido titulo QA', 'Banco 104; Agencia 123; Conta 456-7'],
      ['ausente', 'Favorecido não informado', 'Sem instrução bancária cadastrada']
    ]) {
      await goto(`?dados-pagamento=${modo}&readonly=1`);
      await page.getByText('Titulo TIT-009886', { exact: true }).waitFor();
      assert.equal((await campo('Favorecido').innerText()).trim(), nome);
      assert((await page.locator('body').innerText()).includes(instrucao));
      assert.equal((await campo('Credor').innerText()).trim(), modo === 'medicao' ? 'Credor contrato QA' : 'Credor QA');
      assert.equal(await page.getByRole('button', { name: 'Registrar baixa', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.writes.length), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (modo === 'medicao') await page.screenshot({ path: path.join(output, `dados-pagamento-${width}.png`), fullPage: true });
    }
    for (const modo of ['dados', 'pix-longo']) {
      await goto(`?dados-pagamento=${modo}`);
      const label = modo === 'dados' ? 'Dados para pagamento' : 'Chave PIX / PIX copia e cola';
      await campo(label).getByRole('button', { name: /Ver dados para pagamento/ }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const completo = await dialog.getByLabel('Dados completos para pagamento').inputValue();
      const esperado = await page.evaluate(m => m === 'dados' ? window.titulo.instrucao_favorecido.dados_pagamento : window.titulo.pagamento_negociacao.favorecido_chave_pix, modo);
      assert.equal(completo, esperado);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async value => { window.copiadoQA = value; } } }));
      await dialog.getByRole('button', { name: 'Copiar dados', exact: true }).click();
      await dialog.getByText('Dados copiados.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.copiadoQA), esperado);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => window.writes.length), 0);
    }
    await page.evaluate(() => { window.denied = true; }); await alternate();
    await page.getByText('Título financeiro não encontrado.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Favorecido negociacao QA', { exact: true }).count(), 0, 'Negativa elimina dados antigos do detalhe');
  }
  console.log('OK: detalhe real 1366/390, credor/favorecido/forma/PIX/dados, medicao/solicitacao/manual/partes/negociacao, ausencia, copia integral/escape, permissao negativa e nenhuma baixa. APIs isoladas.');
}
