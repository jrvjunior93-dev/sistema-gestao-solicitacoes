import assert from 'node:assert/strict';
import path from 'node:path';

export async function escolherFiltro(page, label, texto) {
  const input = page.getByRole('combobox', { name: label, exact: true });
  await input.fill(texto);
  await page.getByRole('button', { name: texto, exact: true }).click();
}

export async function validarFiltrosPesquisaFilaUI(page, root) {
  await page.goto('http://127.0.0.1:5308/qa-fila?filtros-pesquisa=1');
  await page.getByText('TIT-00001', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-fila-linha]').count(), 50);
  assert.equal(await page.evaluate(() => window.__sugestoes?.length || 0), 0, 'Montar filtros nao consulta formas antes de abrir');
  const formasDisponiveis=page.getByRole('combobox',{name:'Forma de pagamento',exact:true});
  await formasDisponiveis.click();
  await page.getByRole('button',{name:'BOLETO FORA DA PÁGINA',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'PIX',exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>window.__sugestoes.at(-1).campo),'forma_pagamento_id');
  assert.equal(await page.evaluate(()=>window.__sugestoes.at(-1).q),'');
  await formasDisponiveis.press('Escape');
  // Reabrir com o campo ainda focado (Escape nao transfere foco).
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});
    await formasDisponiveis.click();
    const boleto=page.getByRole('button',{name:'BOLETO FORA DA PÁGINA',exact:true});await boleto.waitFor();
    const bounds=await boleto.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    await page.screenshot({path:path.join(root,'../outputs/fila-formas-disponiveis-'+width+'.png'),fullPage:true});
    await formasDisponiveis.press('Escape');
  }
  await page.setViewportSize({width:1366,height:900});
  const consultasAbertura=await page.evaluate(()=>window.__sugestoes.length);
  await page.getByLabel('Selecionar TIT-00001', { exact: true }).check();
  const obra = page.getByRole('combobox', { name: 'Obra / Centro de custo', exact: true });
  await obra.fill('s'); await page.waitForTimeout(420);
  assert.equal(await page.evaluate(() => window.__sugestoes?.length || 0), consultasAbertura, 'Um caractere em outro campo nao consulta API');
  await obra.fill('sao'); await obra.fill('são'); await obra.fill('São João');
  await page.getByRole('button', { name: '3 · Obra São João', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__sugestoes.length), consultasAbertura+1, 'Debounce evita consulta a cada tecla');
  await obra.press('Enter');
  await page.waitForFunction(() => window.__filterQueries.at(-1).obra_id === '3');
  assert(!(await page.getByLabel('Selecionar TIT-00001', { exact: true }).isChecked()), 'Trocar filtro limpa selecao da baixa');
  assert.equal(await obra.inputValue(), '3 · Obra São João');
  for (const [label, texto, campo, valor] of [
    ['Favorecido', 'Favorecido teste', 'favorecido', 'Favorecido teste'],
    ['Solicitação', 'SOL-0010', 'solicitacao_id', '10'],
    ['Título', 'TIT-00520', 'titulo_id', '520'],
    ['Forma de pagamento', 'PIX', 'forma_pagamento_id', '3']
  ]) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    await input.fill(texto);
    const option = page.getByRole('button', { name: label === 'Título' ? 'TIT-00520 · Descrição do título' : texto, exact: true });
    await option.waitFor(); await input.press('Enter');
    await page.waitForFunction(([k,v]) => window.__filterQueries.at(-1)[k] === v, [campo, valor]);
    assert.equal(new URL(page.url()).searchParams.get(campo), valor);
  }
  await page.getByText('TIT-00520', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-fila-linha]').count(), 1, 'Titulo fora dos primeiros 500 e pesquisado pelo servidor');
  // Forma efetiva local pode diferir da prevista. Filtrar nao apaga o draft.
  const formaEfetiva = page.getByLabel('Forma de pagamento de TIT-00520', { exact: true });
  await formaEfetiva.selectOption('4');
  await page.getByLabel('Origem do cheque de TIT-00520', { exact: true }).selectOption('CARTEIRA');
  await page.getByRole('button', { name: 'Limpar Forma de pagamento', exact: true }).click();
  assert.equal(await formaEfetiva.inputValue(), '4');
  await page.getByLabel('Vencimento de', { exact: true }).fill('24102026');
  await page.getByLabel('Vencimento até', { exact: true }).fill('23102026');
  await page.getByRole('button', { name: 'Filtrar vencimento', exact: true }).click();
  await page.getByRole('alert').getByText('A data inicial não pode ser posterior à final.', { exact: true }).waitFor();
  assert(!new URL(page.url()).searchParams.has('vencimento_de'));
  await page.getByLabel('Vencimento de', { exact: true }).fill('01102026');
  await page.getByRole('button', { name: 'Filtrar vencimento', exact: true }).click();
  await page.waitForFunction(() => window.__filterQueries.at(-1).vencimento_de === '2026-10-01');
  assert.equal(new URL(page.url()).searchParams.get('vencimento_ate'), '2026-10-23');
  // Uma resposta antiga nao substitui sugestoes da consulta atual.
  const favorecido = page.getByRole('combobox', { name: 'Favorecido', exact: true });
  await favorecido.fill('antiga');
  await page.waitForFunction(() => window.__sugestoes.some(q => q.q === 'antiga'));
  await favorecido.fill('Favorecido teste');
  await page.waitForTimeout(850);
  assert.equal(await page.getByRole('button', { name: 'Opção antiga não deve aparecer', exact: true }).count(), 0);
  assert(await page.evaluate(() => window.__abortadas.includes('antiga')));
  await favorecido.press('Escape');
  assert.equal(await favorecido.inputValue(), 'Favorecido teste', 'Escape restaura selecao; digitacao nao aplica filtro');
  await favorecido.fill('erro');
  await page.getByRole('status').getByText('Falha ao consultar sugestões QA', { exact: true }).waitFor();
  await favorecido.press('Escape');
  // Todos os campos devem caber, sem rolagem horizontal da pagina.
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await obra.fill('São João');
    await page.getByRole('button', { name: '3 · Obra São João', exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, `../outputs/fila-filtros-pesquisa-${width}.png`), fullPage: true });
    const bounds = await page.getByRole('button', { name: '3 · Obra São João', exact: true }).boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Sugestao em portal fica dentro da tela');
    await obra.press('Escape');
  }
  await page.getByRole('button', { name: 'Limpar filtros dos títulos', exact: true }).click();
  await page.getByText('TIT-00001', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.size, 0);
  assert.equal(await page.getByLabel('Vencimento de', { exact: true }).inputValue(), '');
  await page.getByLabel('Busca geral da fila', { exact: true }).fill('TIT-00520');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page.getByText('TIT-00520', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-fila-linha]').count(), 1);
  assert.equal(await page.evaluate(() => window.__settles.length), 0, 'Nenhuma baixa ou outro envio financeiro');
  await page.goto('http://127.0.0.1:5308/qa-fila?filtros-pesquisa=1&titulo_id=520&obra_id=3');
  await page.getByText('TIT-00520', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="Título"]').value === 'TIT-00520');
  assert.equal(await page.getByRole('combobox', { name: 'Obra / Centro de custo', exact: true }).inputValue(), '3 · Obra São João');
  assert.equal(await page.evaluate(() => window.__sugestoes?.length || 0), 0, 'Restaurar rotulos nao faz outra consulta');
  console.log('OK fila: autocomplete local/remoto, debounce/cancelamento, filtros/URL/paginacao >500, forma prevista sem apagar draft, datas e limpeza; UI1366/390 sem escrita externa.');
}
