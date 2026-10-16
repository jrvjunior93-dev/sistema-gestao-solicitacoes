import assert from 'node:assert/strict';
import path from 'node:path';
export async function validarTituloDesvincularFatura(page, goto, alternate, output) {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await goto('?desvincular=1');
    const botao = page.getByRole('button', { name: 'Desvincular previsão de cartão', exact: true });
    await botao.click();
    const dialogo = page.getByRole('dialog', { name: 'Desvincular previsão de cartão', exact: true });
    const confirmar = dialogo.getByRole('button', { name: 'Confirmar desvinculação', exact: true });
    assert(await confirmar.isDisabled());
    await page.keyboard.press('Escape'); await dialogo.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await botao.click(); await dialogo.getByRole('button', { name: 'Manter vínculo', exact: true }).click();
    await dialogo.waitFor({ state: 'detached' }); assert.equal(await page.evaluate(() => window.writes.length), 0);
    await botao.click();
    await dialogo.getByLabel('Motivo da desvinculação', { exact: true }).fill('Cartão e parcelamento previstos incorretamente');
    await alternate(); await dialogo.waitFor();
    assert.equal(await dialogo.getByLabel('Motivo da desvinculação', { exact: true }).inputValue(), 'Cartão e parcelamento previstos incorretamente');
    await page.screenshot({ path: path.join(output, `desvincular-fatura-${width}.png`), fullPage: true });
    await confirmar.evaluate(node => { node.click(); node.click(); });
    await dialogo.waitFor({ state: 'detached' }); await botao.waitFor({ state: 'detached' });
    const dados = await page.evaluate(() => ({ writes: window.writes, titulo: window.titulo }));
    assert.equal(dados.writes.length, 1); assert.equal(dados.writes[0].kind, 'desvincular');
    assert.equal(dados.writes[0].data.fatura_cartao_id, 79); assert(dados.writes[0].data.idempotency_key);
    assert.equal(dados.titulo.valor_original, 100); assert.equal(dados.titulo.valor_saldo, 100);
    assert.equal(dados.titulo.total_parcelas, 2); assert.equal(dados.titulo.status, 'ABERTO');
    assert.equal(dados.titulo.fatura_cartao_id, null);
    await page.getByRole('link', { name: 'Editar título', exact: true }).waitFor();

    await goto('?desvincular=1&readonly=1'); await page.getByText('Titulo TIT-QA', { exact: true }).waitFor();
    assert.equal(await botao.count(), 0); assert.equal(await page.evaluate(() => window.writes.length), 0);
    await goto('?desvincular=1&correcao=1'); await page.getByText('Titulo TIT-QA', { exact: true }).waitFor();
    assert.equal(await botao.count(), 0, 'Baixa anterior impede acao no frontend');

    await goto('?desvincular=1&recusa=1'); await botao.click();
    await dialogo.getByLabel('Motivo da desvinculação', { exact: true }).fill('Motivo conferido QA');
    await confirmar.click(); await dialogo.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.titulo.fatura_cartao_id), 79);
    assert.equal(await page.evaluate(() => window.writes.length), 1);
    await page.evaluate(() => { window.forceUnlinkError = false; });
    await confirmar.click(); await botao.waitFor({ state: 'detached' });
    const tentativas = await page.evaluate(() => window.writes);
    assert.equal(tentativas.length, 2); assert.equal(tentativas[0].data.idempotency_key, tentativas[1].data.idempotency_key,
      'Repeticao apos falha conserva chave para recuperar resultado sem duplicar');
  }
  console.log('OK: desvincular no detalhe real desktop/mobile, motivo, cancelamento/Escape, rascunho, permissao/baixa, erro, retry com mesma chave e duplo clique. APIs isoladas.');
}
