// Usa a fila, o painel e o contexto reais. Somente APIs sao simuladas em memoria.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const outputs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../outputs');
const lista = 'financeiro-fila-pagamentos';

export async function validarColunasFila(browser) {
  const banco = new Map(), escritas = [], erros = [], externas = [], contexts = [];
  const abrir = async usuario => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => erros.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), pathname = url.pathname;
      const prefs = banco.get(usuario) || {};
      const responder = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (pathname.endsWith('/me/preferencias')) return responder({ listas: prefs, total: Object.keys(prefs).length });
      if (pathname.endsWith('/me/preferencias/adotar')) return responder({ adotadas: 0 });
      const tipo = pathname.match(/\/listas\/financeiro-fila-pagamentos\/preferencias\/(colunas|larguras)$/)?.[1];
      if (tipo) {
        prefs[lista] ||= {};
        if (req.method() === 'DELETE') delete prefs[lista][tipo];
        else prefs[lista][tipo] = req.postDataJSON().preferencias;
        banco.set(usuario, prefs);
        escritas.push({ usuario, tipo, metodo: req.method() });
        return responder({ ok: true });
      }
      if (url.origin === 'http://127.0.0.1:5308') return route.continue();
      externas.push(req.url()); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5308/qa-fila?preferencias=1&usuario=${usuario}&massa=1&status=TODOS`);
    await page.getByLabel('Selecionar TIT-MASSA-1', { exact: true }).waitFor();
    return page;
  };
  const ordem = page => page.locator('thead th').evaluateAll(nodes => nodes.map(node => node.dataset.coluna));
  const alinhar = async page => {
    const esperado = await ordem(page);
    assert.equal(await page.locator('colgroup col').count(), esperado.length);
    for (const cells of await page.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(c => c.dataset.coluna)))) {
      assert.deepEqual(cells, esperado, 'Dados, cabecalho e larguras usam a mesma ordem');
    }
  };
  const painel = async page => {
    const button = page.getByRole('button', { name: 'Colunas', exact: true });
    if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    const menu = page.getByRole('menu'); await menu.waitFor(); return menu;
  };
  const aguardarGravacao = async page => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('financeiro-fila-pagamentos:colunas'))?.ordem?.length === 17);
    // Debounce existente e mock de servidor. Nenhuma escrita em banco real.
    await page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/preferencias/colunas'));
  };
  try {
    const page = await abrir(71);
    const original = await ordem(page); assert.equal(original.length, 17);
    await page.getByLabel('Selecionar TIT-MASSA-1', { exact: true }).check();
    const juros = page.getByLabel('Juros de TIT-MASSA-1', { exact: true });
    await juros.fill('25');
    const menu = await painel(page);
    for (const label of ['Seleção', 'Título / documento', 'Status / ações']) assert(await menu.getByLabel(label, { exact: true }).isDisabled());
    await menu.getByLabel('Juros (R$)', { exact: true }).uncheck();
    assert.equal(await juros.count(), 0);
    await menu.getByLabel('Conta pagadora', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Arrastar coluna Obra / Centro de Custo', exact: true }).dragTo(page.locator('th[data-coluna="titulo"]'));
    assert((await ordem(page)).indexOf('local') < (await ordem(page)).indexOf('titulo'), 'Arrasto real muda a ordem');
    await alinhar(page);
    const menu2 = await painel(page);
    await menu2.getByRole('button', { name: 'Mover Obra / Centro de Custo para cima', exact: true }).click();
    assert.equal((await ordem(page))[0], 'local');
    // O painel compartilhado tambem aceita arrastar pela alca.
    const dado = menu2.locator('[data-coluna="dados"]');
    await dado.locator('.app-colunas-arrastar').hover();
    await page.mouse.down();
    await page.mouse.move((await menu2.locator('[data-coluna="credor"]').boundingBox()).x + 35,
      (await menu2.locator('[data-coluna="credor"]').boundingBox()).y + 20, { steps: 8 });
    await page.mouse.up();
    assert((await ordem(page)).indexOf('dados') < (await ordem(page)).indexOf('credor'));
    assert(await page.getByLabel('Selecionar TIT-MASSA-1', { exact: true }).isChecked(), 'Reordenar preserva selecao');
    await menu2.getByLabel('Juros (R$)', { exact: true }).check();
    assert.equal(await juros.inputValue(), '25', 'Ocultar/mover nao perde o valor editado');
    assert.equal(await page.getByLabel('Valor pago de TIT-MASSA-1', { exact: true }).inputValue(), '228.00');
    await menu2.getByLabel('Juros (R$)', { exact: true }).uncheck();
    await aguardarGravacao(page);
    const personalizada = await ordem(page);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('thead th')?.dataset.coluna === 'local');
    assert.deepEqual(await ordem(page), personalizada); await alinhar(page);
    const outroDispositivo = await abrir(71);
    await outroDispositivo.waitForFunction(() => document.querySelector('thead th')?.dataset.coluna === 'local');
    assert.deepEqual(await ordem(outroDispositivo), personalizada, 'Preferencia vem do servidor em navegador sem armazenamento local');
    const outroUsuario = await abrir(72);
    assert.deepEqual(await ordem(outroUsuario), original, 'Outro usuario nao recebe a configuracao');
    const legado = ['local', ...original.filter(key => key !== 'local' && key !== 'desconto')];
    banco.set(73, { [lista]: { colunas: { ordem: legado, visiveis: legado, ocultas: [] } } });
    const usuarioLegado = await abrir(73);
    await usuarioLegado.waitForFunction(() => document.querySelector('thead th')?.dataset.coluna === 'local');
    const migrada = await ordem(usuarioLegado);
    assert.equal(migrada.indexOf('desconto') + 1, migrada.indexOf('juros'), 'Coluna nova entra antes de Juros nas preferencias antigas');
    assert.deepEqual(migrada.filter(key => key !== 'desconto'), legado, 'Ordem personalizada antiga permanece intacta');

    // Campo necessario oculto precisa reaparecer sem bloquear a operacao.
    await page.getByRole('button', { name: 'Colunas', exact: true }).click();
    await page.keyboard.press('Escape');
    await (await painel(page)).getByLabel('Conta pagadora', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByLabel('Conta pagadora de TIT-MASSA-1', { exact: true }).selectOption('');
    await (await painel(page)).getByLabel('Conta pagadora', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Registrar baixa', exact: true }).first().click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.getByRole('button', { name: /Corrigir|Voltar|Fechar/ }).first().click();
    await page.getByLabel('Conta pagadora de TIT-MASSA-1', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
    await alinhar(page);

    // A coluna condicional Motivo continua seguindo o recorte existente.
    const status = page.locator('select').filter({ has: page.locator('option[value="TODOS"]') });
    await status.selectOption('BAIXADO');
    await page.waitForFunction(() => !document.querySelector('thead th[data-coluna="justificativa"]'));
    await alinhar(page);
    await status.selectOption('TODOS');
    await page.locator('thead th[data-coluna="justificativa"]').waitFor(); await alinhar(page);
    const menu3 = await painel(page);
    await menu3.getByLabel('Juros (R$)', { exact: true }).check();
    await menu3.getByLabel('Multa (R$)', { exact: true }).uncheck();
    await aguardarGravacao(page);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await menu3.isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(outputs, `fila-colunas-${width}.png`) });
    }
    // Restaurar colunas nao remove configuracao independente de larguras.
    banco.get(71)[lista].larguras = { selecao: 0.1, titulo: 0.9 };
    const reset = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().endsWith('/preferencias/colunas'));
    await menu3.getByRole('button', { name: 'Restaurar padrão', exact: true }).click(); await reset;
    assert.equal(banco.get(71)[lista].colunas, undefined);
    assert.deepEqual(banco.get(71)[lista].larguras, { selecao: 0.1, titulo: 0.9 });
    assert.deepEqual(await ordem(page), original); await alinhar(page);
    assert(escritas.some(e => e.usuario === 71 && e.tipo === 'colunas' && e.metodo === 'PUT'));
    assert(!escritas.some(e => e.usuario === 72));
    assert.deepEqual(erros, []); assert.deepEqual(externas, []);
    console.log('OK: fila/Colunas/contexto reais, arrasto, setas, visibilidade, alinhamento, valores preservados, recortes, campo oculto invalido, persistencia/reload/outro navegador, isolamento por usuario e reset desktop/mobile. APIs em memoria.');
  } finally { for (const context of contexts) await context.close(); }
}
