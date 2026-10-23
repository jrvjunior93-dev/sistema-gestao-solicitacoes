import assert from 'node:assert/strict';
import path from 'node:path';

// Pagina, contexto, painel e transporte de preferencias reais; banco HTTP
// simulado por usuario. Nenhuma API externa ou escrita financeira.
export async function validarArranjoFiltrosFila(browser, root) {
  const banco = new Map(), escritas = [], contexts = [], erros = [], externas = [];
  const abrir = async usuario => {
    const contexto = await browser.newContext({ viewport: { width: 1366, height: 900 } }); contexts.push(contexto);
    const page = await contexto.newPage(); page.on('pageerror', error => erros.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), prefs = banco.get(usuario) || {};
      const responder = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/me/preferencias')) return responder({ listas: prefs, total: Object.keys(prefs).length });
      if (url.pathname.endsWith('/me/preferencias/adotar')) return responder({ adotadas: 0 });
      const match = url.pathname.match(/\/listas\/([^/]+)\/preferencias\/(filtros|colunas|larguras|visual)$/);
      if (match) {
        const lista = decodeURIComponent(match[1]), tipo = match[2]; prefs[lista] ||= {};
        if (req.method() === 'DELETE') delete prefs[lista][tipo];
        else prefs[lista][tipo] = req.postDataJSON().preferencias;
        banco.set(usuario, prefs); escritas.push({ usuario, lista, tipo, metodo: req.method() }); return responder({ ok: true });
      }
      if (url.origin === 'http://127.0.0.1:5308') return route.continue();
      externas.push(req.url()); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5308/qa-fila?preferencias=1&filtros-pesquisa=1&usuario=${usuario}`);
    await page.getByText('TIT-00001', { exact: true }).waitFor();
    return page;
  };
  const ordem = page => page.locator('[data-filtro-id]').evaluateAll(nodes => nodes.map(n => n.dataset.filtroId));
  const painel = async page => {
    const menu = page.getByRole('menu', { name: 'Organizar filtros', exact: true });
    if (!(await menu.isVisible())) await page.getByRole('button', { name: /^Organizar filtros/ }).click();
    await menu.waitFor(); return menu;
  };
  const gravar = page => page.waitForResponse(r => /\/preferencias\/filtros$/.test(r.url()) && r.request().method() === 'PUT');
  const chave = 'financeiro-fila-pagamentos:filtros:1';
  try {
    const page = await abrir(1), inicial = await ordem(page);
    const origem = page.getByRole('combobox', { name: 'Origem dos títulos', exact: true });
    assert.equal(await origem.inputValue(), ''); assert.equal(await origem.getAttribute('placeholder'), 'Digite a origem…');
    for (const label of ['Empresa do título / colaborador', 'Credor', 'Recebimento DP', 'Obra / Centro de custo', 'Favorecido', 'Solicitação', 'Título', 'Forma de pagamento']) {
      const input = page.getByRole('combobox', { name: label, exact: true }); assert.equal(await input.inputValue(), '');
      assert((await input.getAttribute('placeholder')).startsWith('Digite '));
    }
    assert.equal(await page.getByLabel('Status', { exact: true }).inputValue(), 'Pendentes');
    assert(!Object.keys(await page.evaluate(() => window.__filterQueries.at(-1))).some(k => ['origem', 'credor_id', 'obra_id'].includes(k)));
    await origem.click(); await origem.pressSequentially('rh');
    assert.equal(await origem.inputValue(), 'rh', 'Digita imediatamente sem apagar Todos');
    await page.getByRole('button', { name: 'RH/DP', exact: true }).click();
    await page.waitForFunction(() => window.__filterQueries.at(-1).origem === 'RH_DP');
    await origem.click(); await origem.pressSequentially('Outras');
    assert.equal(await origem.inputValue(), 'Outras', 'Nova digitacao substitui selecao anterior');
    await origem.press('Escape');
    await page.waitForFunction(() => document.querySelector('[aria-label="Origem dos títulos"]').value === 'RH/DP');
    assert.equal(await origem.inputValue(), 'RH/DP');
    await page.getByRole('button', { name: 'Limpar Origem', exact: true }).click();
    await page.waitForFunction(() => !window.__filterQueries.at(-1).origem);
    assert.equal(await origem.inputValue(), '');
    const selecionado = page.getByLabel('Selecionar TIT-00001', { exact: true });
    await selecionado.check();
    const valor = page.getByLabel('Valor pago de TIT-00001', { exact: true }); await valor.fill('155.00');
    const consultas = await page.evaluate(() => window.__filterQueries.length);
    let menu = await painel(page), ack = gravar(page);
    await menu.getByRole('button', { name: 'Mover filtro Origem para cima', exact: true }).click(); await ack;
    assert.equal((await ordem(page))[0], 'origem'); assert(await selecionado.isChecked()); assert.equal(await valor.inputValue(), '155.00');
    assert.equal(await page.evaluate(() => window.__filterQueries.length), consultas, 'Ordem nao consulta/pagina/limpa selecao');
    ack = gravar(page);
    await menu.locator('[data-filtro-config="credor_id"] input').uncheck(); await ack;
    assert.equal(await page.getByRole('combobox', { name: 'Credor', exact: true }).count(), 0); assert(await selecionado.isChecked());
    assert.equal(await page.evaluate(() => window.__filterQueries.length), consultas, 'Ocultar vazio nao muda consulta');
    assert(await menu.locator('[data-filtro-config="busca"] input').isDisabled(), 'Busca geral sempre disponivel');
    // Arrasto e setas escrevem a mesma ordem, sem mexer no valor do pagamento.
    const dt = await page.evaluateHandle(() => new DataTransfer()); ack = gravar(page);
    await menu.getByRole('button', { name: 'Arrastar filtro Título', exact: true }).dispatchEvent('dragstart', { dataTransfer: dt });
    await menu.locator('[data-filtro-config="origem"]').dispatchEvent('dragover', { dataTransfer: dt });
    await menu.locator('[data-filtro-config="origem"]').dispatchEvent('drop', { dataTransfer: dt }); await ack;
    assert.equal((await ordem(page))[0], 'titulo_id'); assert.equal(await valor.inputValue(), '155.00');
    assert.deepEqual(banco.get(1)[chave].filtros.ordem.slice(0, 2), ['titulo_id', 'origem']);
    assert(!JSON.stringify(banco.get(1)[chave].filtros).includes('155'), 'Preferencia nao guarda valores financeiros');
    await page.keyboard.press('Escape');
    // Mesmo usuario em outro navegador recebe a escolha do servidor.
    const outra = await abrir(1); assert.equal((await ordem(outra))[0], 'titulo_id'); assert.equal(await outra.getByRole('combobox', { name: 'Credor', exact: true }).count(), 0);
    const outroUsuario = await abrir(2); assert.deepEqual(await ordem(outroUsuario), inicial); assert(await outroUsuario.getByRole('combobox', { name: 'Credor', exact: true }).isVisible());
    // Reiniciar no mesmo navegador tambem preserva configuracao e isolamento.
    await page.goto('http://127.0.0.1:5308/qa-fila?preferencias=1&filtros-pesquisa=1&usuario=2');
    await page.getByText('TIT-00001', { exact: true }).waitFor(); assert.deepEqual(await ordem(page), inicial);
    await page.goto('http://127.0.0.1:5308/qa-fila?preferencias=1&filtros-pesquisa=1&usuario=1');
    await page.getByText('TIT-00001', { exact: true }).waitFor(); assert.equal((await ordem(page))[0], 'titulo_id');
    // Link preenche um campo oculto: ele volta a aparecer, sem apagar criterio.
    await page.goto('http://127.0.0.1:5308/qa-fila?preferencias=1&filtros-pesquisa=1&usuario=1&credor_id=11');
    const credor = page.getByRole('combobox', { name: 'Credor', exact: true }); await credor.waitFor();
    await page.waitForFunction(() => window.__filterQueries.at(-1).credor_id === '11');
    menu = await painel(page); const linha = menu.locator('[data-filtro-config="credor_id"]');
    assert((await linha.innerText()).includes('preenchido: esconder limpa e refaz a consulta'));
    ack = gravar(page); await linha.locator('input').uncheck(); await ack;
    await page.waitForFunction(() => !window.__filterQueries.at(-1).credor_id); assert.equal(await credor.count(), 0);
    assert.equal(new URL(page.url()).searchParams.get('credor_id'), null);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 }); menu = await painel(page);
      const caixa = await menu.boundingBox(); assert(caixa.x >= 0 && caixa.x + caixa.width <= width + 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(root, `../outputs/fila-arranjo-filtros-${width}.png`) });
    }
    const reset = page.waitForResponse(r => /\/preferencias\/filtros$/.test(r.url()) && r.request().method() === 'DELETE');
    await menu.getByRole('button', { name: 'Restaurar padrão', exact: true }).click(); await reset;
    assert.deepEqual(await ordem(page), inicial); assert(await page.getByRole('combobox', { name: 'Credor', exact: true }).isVisible());
    assert.equal(await page.evaluate(() => window.__settles.length), 0); assert(!banco.get(1)[chave].filtros);
    await page.goto('http://127.0.0.1:5308/qa-fila?preferencias=1&filtros-pesquisa=1&usuario=1&readonly=1');
    await page.getByText('TIT-00001', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Registrar baixa', exact: true }).count(), 0);
    assert(await page.getByRole('button', { name: /^Organizar filtros/ }).isEnabled(), 'Usuario consultivo pode configurar somente sua exibicao');
    assert(escritas.every(e => e.tipo === 'filtros')); assert.deepEqual(erros, []); assert.deepEqual(externas, []);
    console.log('OK arranjo: placeholders/primeira digitacao/troca, ordem setas/arrasto, visibilidade/ativo/URL/reset, selecao/drafts, persistencia/isolamento usuarios/navegadores, consultivo e1366/390. Somente preferencias simuladas.');
  } finally { for (const context of contexts) await context.close(); }
}
