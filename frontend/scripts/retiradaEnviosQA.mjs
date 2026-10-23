import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
export async function validarRetiradaFila(page, root) {
  const calls = []; let loseResponse = true, stale = false;
  await page.route('**/financeiro/envios/retirada/*', async route => {
    const p = route.request(), body = p.postDataJSON(); calls.push({ acao: new URL(p.url()).pathname.split('/').at(-1), body });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (p.url().endsWith('/preview')) return json({ referencia: 'a'.repeat(64), saldo_total: 260,
      itens: body.itens.map(i => ({ ...i, codigo: 'TIT-RET-' + i.titulo_id, pago: i.titulo_id === 2 ? 40 : 0, saldo: i.titulo_id === 2 ? 60 : 200 })) });
    if (stale) return json({ message: 'Saldo alterado. Confira novamente.' }, 409);
    await new Promise(r => setTimeout(r, 150));
    await page.evaluate(ids => { window.__retirados = ids; }, body.itens.map(i => i.titulo_id));
    if (loseResponse) { loseResponse = false; return route.abort('connectionfailed'); }
    return json({ retirada_id: 7, retirados: body.itens });
  });
  const start = async extra => {
    await page.goto('http://127.0.0.1:5308/qa-fila?retirada=1&readonly=1&status=TODOS' + (extra || ''));
    await page.getByText('TIT-RET-1', { exact: true }).waitFor();
  };
  await start('&sem-retirar=1'); assert.equal(await page.getByRole('button', { name: /^Retirar envios/ }).count(), 0);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await start();
    assert.equal(await page.getByRole('button', { name: 'Registrar baixa', exact: true }).count(), 0, 'Permissao de retirada nao concede baixa');
    await page.getByRole('checkbox', { name: /Selecionar todos os elegíveis/ }).first().check();
    const retirar = page.getByRole('button', { name: 'Retirar envios (2)', exact: true }); await retirar.click();
    const modal = page.getByRole('dialog', { name: 'Retirar envios', exact: true }); await modal.getByText('TIT-RET-2', { exact: true }).waitFor();
    assert((await modal.innerText()).includes('40,00'), 'Conferencia exibe baixa anterior');
    assert((await modal.innerText()).includes('60,00'), 'Conferencia exibe saldo restante');
    assert(await modal.getByRole('button', { name: 'Confirmar retirada', exact: true }).isDisabled());
    const confirms = calls.filter(c => c.acao === 'confirmar').length;
    await modal.getByRole('button', { name: 'Voltar', exact: true }).click(); assert.equal(calls.filter(c => c.acao === 'confirmar').length, confirms);
    assert(await retirar.isEnabled(), 'Cancelar destrava tela e preserva selecao'); await retirar.click();
    await modal.getByLabel('Motivo da retirada *', { exact: true }).fill('Encaminhamento indevido QA');
    const out = path.resolve(root, '../outputs/retirada-envios-20261023'); await mkdir(out, { recursive: true });
    await page.screenshot({ path: path.join(out, `fila-confirmacao-${width}.png`), fullPage: false });
    assert(await modal.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'Modal cabe no viewport');
    // Primeiro envio perde a resposta, retry precisa repetir corpo/chave sem nova baixa.
    await modal.getByRole('button', { name: 'Confirmar retirada', exact: true }).dblclick();
    if (width === 1366) {
      await modal.getByRole('alert').waitFor();
      assert.equal(calls.filter(c => c.acao === 'confirmar').length, confirms + 1, 'Duplo clique envia uma vez');
      assert(await modal.getByLabel('Motivo da retirada *').isDisabled(), 'Retry conserva corpo original');
      await modal.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
    }
    await modal.waitFor({ state: 'detached' });
    const ps = calls.filter(c => c.acao === 'confirmar');
    if (width === 1366) assert.deepEqual(ps.at(-1).body, ps.at(-2).body, 'Retry idempotente conserva chave e corpo');
    await page.getByText(/envio\(s\) retirado\(s\). Baixas anteriores preservadas/).waitFor();
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
  }
  await start(); stale = true; await page.getByRole('checkbox', { name: /Selecionar todos os elegíveis/ }).first().check();
  await page.getByRole('button', { name: 'Retirar envios (2)', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Retirar envios', exact: true });
  await modal.getByLabel('Motivo da retirada *').fill('Conferencia de saldo'); await modal.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
  await modal.getByRole('alert').filter({ hasText: 'Saldo alterado' }).waitFor();
  await modal.getByRole('button', { name: 'Voltar', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Retirar envios (2)', exact: true }).isEnabled());
  await start('&nao-pago=1');
  await page.getByRole('checkbox', { name: /Selecionar todos os elegíveis/ }).first().check();
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Retirar envios (2)', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Retirar envios (2)', exact: true }).isEnabled(), 'Selecao de nao pago/parcial sobrevive a revalidacao de leitura');
  console.log('OK UI fila real: permissao nominal sem baixa, selecao direta/parcial, motivo, cancelar, duplo clique, resposta perdida/retry identico, saldo obsoleto e 1366/390. APIs isoladas.');
}
