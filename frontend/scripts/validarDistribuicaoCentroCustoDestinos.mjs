// Nova Solicitacao e relatorio reais; API interceptada, sem banco/storage externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/distribuicao-centros-destinos'); fs.mkdirSync(output, { recursive: true });
const origem = { id: 30, codigo: 'ADM', nome: 'Administrativo Escritorio', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true };
const destinos = [{ id: 1, codigo: 'OB-1', nome: 'Obra QA', tipo_centro_custo: 'OBRA', classificacao: 'PUBLICA' },
  { id: 31, codigo: 'RH', nome: 'Departamento Pessoal QA', tipo_centro_custo: 'CENTRO_CUSTO' },
  { id: 32, codigo: 'COM', nome: 'Comercial QA', tipo_centro_custo: 'CENTRO_CUSTO' }];
const tipo = { id: 5, nome: 'DESPESA ADMINISTRATIVA', ativo: true, comportamento: { mostrar_valor: true, mostrar_descricao: true } };
const campos = Object.fromEntries(['contrato','apropriacao_principal','apropriacoes_contrato','credor','cadastro_credor','forma_pagamento','favorecido_pagamento','dados_pagamento','anexos','subtipo','justificativa','data_demissao','periodo_medicao','data_vencimento','itens_apropriacao','ref_contrato_abertura'].map(k => [k, { visivel: false, obrigatorio: false }]));
campos.valor = { visivel: true, obrigatorio: true }; campos.descricao = { visivel: true, obrigatorio: true };
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-relatorio-destinos', configureServer(vite) {
    vite.middlewares.use('/qa-relatorio-destinos', async (_req, res) => {
      res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml('/qa-relatorio-destinos', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from'/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx';import Config from'/src/components/obras/DistribuicaoCentroCustoConfig.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import '/src/index.css';import '/src/styles/componentes-padrao.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},location.search.includes('config')?React.createElement(Config,{centro:{id:30,nome:'Administrativo'},onFechar:()=>{window.fechouConfig=true;}}):React.createElement(Page))));
</script></body></html>`));
    });
  }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(12000);
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const errors = [], unexpected = [], posts = [], configs = []; let negar = false, liberarPost, reportFilters = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/obras/minhas')) return json([origem]);
  if (url.pathname.endsWith('/tipos-solicitacao/disponiveis')) return json({ tipos: [tipo], destino_inicial: { codigo: 'GEO', nome: 'Gerencia de Processos' }, tipo_automatico: false });
  if (url.pathname.endsWith('/tipos-solicitacao')) return json([tipo]);
  if (url.pathname.endsWith('/tipos-sub-contrato')) return json([]);
  if (url.pathname.endsWith('/configuracoes/nova-solicitacao-campos')) return json({ regras: { GEO: { tipos: { 5: { campos } } } } });
  if (url.pathname.endsWith('/configuracoes/nova-solicitacao-automacao-destino')) return json({ destinos_disponiveis: [], regras: {} });
  if (url.pathname.endsWith('/contratos/medicoes/formas-pagamento')) return json({ formas: [] });
  if (url.pathname.endsWith('/apropriacoes')) return json([]);
  if (url.pathname.endsWith('/centros-custo/30/obras-distribuicao')) return json({ regra: 'TODAS', obras: destinos });
  if (url.pathname.endsWith('/centros-custo/30/configuracao-distribuicao')) {
    if (req.method() === 'PUT') { configs.push(req.postDataJSON()); return json(configs.at(-1)); }
    return json({ obras_ids: null, obras: destinos });
  }
  if (url.pathname.endsWith('/solicitacoes') && req.method() === 'POST') {
    posts.push({ body: req.postDataJSON(), headers: req.headers() });
    if (negar) return json({ error: 'Falha temporaria QA. Tente novamente.' }, 503);
    if (liberarPost === 'aguardar') await new Promise(ok => { liberarPost = ok; });
    return json({ id: 101, codigo: 'SOL-QA' }, 201);
  }
  if (url.pathname.endsWith('/financeiro/relatorios/centros-custo/distribuicao-obras')) {
    reportFilters.push(url.searchParams.get('obra_id'));
    const selected = destinos.filter(d => d.id !== 1 && (!url.searchParams.get('obra_id') || d.id === Number(url.searchParams.get('obra_id'))));
    const linhas = selected.map((obra, i) => ({ id: i + 1, centro_custo: origem, obra, abrangencia: 'OBRA', criterio: 'VALOR', percentual: obra.id === 31 ? 60 : 40,
      valor_distribuido: obra.id === 31 ? 60 : 40, solicitacao: { id: 101, codigo: 'SOL-QA', descricao: 'Despesa administrativa', tipo: { nome: tipo.nome } } }));
    return json({ linhas, filtros: { centros_custo: [origem], obras: destinos }, resumo: { valor_total: linhas.reduce((s,l)=>s+l.valor_distribuido,0), solicitacoes: 1, centros_custo: 1, obras: linhas.length, registros_todas: 0 } });
  }
  if (url.origin === base && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const salvar = () => page.getByRole('button', { name: /criar solicitação|enviar solicitação|salvar solicitação/i });
try {
  for (const [width, criterio] of [[390, 'PERCENTUAL'], [1366, 'VALOR'], [1366, 'TODAS']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/scripts/fixtures/adiantamento.html?nova');
    await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Administrativo');
    await page.getByRole('button', { name: /Administrativo Escritorio.*ADM/ }).click();
    await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
    await page.getByText('Distribuição gerencial por obra / centro de custo', { exact: true }).waitFor();
    await page.locator('[name="valor"]').fill('100,00');
    await page.locator('[name="descricao"]').fill('Despesa administrativa QA');
    const antes = posts.length;
    if (criterio === 'TODAS') await page.getByRole('radio', { name: /^TODAS/ }).check();
    else {
      if (criterio === 'VALOR') await page.getByRole('button', { name: 'Valor em R$', exact: true }).click();
      await page.getByRole('checkbox', { name: /RH · Departamento Pessoal QA/ }).check();
      await page.getByRole('checkbox', { name: /COM · Comercial QA/ }).check();
      const prefixo = criterio === 'VALOR' ? 'Valor' : 'Percentual';
      await page.getByLabel(`${prefixo} destinado para Departamento Pessoal QA`, { exact: true }).fill('60');
      await page.getByLabel(`${prefixo} destinado para Comercial QA`, { exact: true }).fill('39');
      await salvar().click();
      await page.getByText(criterio === 'VALOR' ? 'A soma da distribuição deve ser igual ao valor total da solicitação.' : 'A soma da distribuição deve ser exatamente 100%.', { exact: true }).waitFor();
      assert.equal(posts.length, antes);
      await page.getByLabel(`${prefixo} destinado para Comercial QA`, { exact: true }).fill('40');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByText('Distribuição gerencial por obra / centro de custo', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `destinos-${width}-${criterio}.png`) });
    }
    if (criterio === 'VALOR') {
      negar = true; await salvar().click();
      await page.getByText('Falha temporaria QA. Tente novamente.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Valor destinado para Departamento Pessoal QA', { exact: true }).inputValue(), '60');
      negar = false; liberarPost = 'aguardar';
    }
    await salvar().click();
    if (criterio === 'VALOR') {
      await page.waitForFunction(() => document.querySelector('button[type=submit]')?.disabled);
      await page.locator('button[type=submit]').evaluate(button => button.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(posts.length, antes + 2, 'Retry mais um POST em voo; duplo submit nao envia de novo');
      liberarPost(); liberarPost = null;
    }
    await page.waitForURL('**/solicitacoes/101');
    const payload = posts.at(-1).body;
    assert.equal(Number(payload.obra_id), 30); assert.equal(Number(payload.valor), 100);
    assert.equal(Number(payload.tipo_solicitacao_id), 5);
    if (criterio === 'TODAS') { assert.equal(payload.distribuicao_centro_custo.abrangencia, 'TODAS'); assert.deepEqual(payload.distribuicao_centro_custo.itens, []); }
    else {
      assert.equal(payload.distribuicao_centro_custo.criterio, criterio);
      assert.deepEqual(payload.distribuicao_centro_custo.itens.map(l => [Number(l.obra_id), Number(l[criterio === 'VALOR' ? 'valor' : 'percentual'])]), [[31, 60], [32, 40]]);
    }
  }
  await page.goto(base + '/qa-relatorio-destinos');
  await page.locator('thead th').filter({ hasText: /^Centro de custo de origem$/ }).waitFor();
  await page.locator('thead th').filter({ hasText: /^Obra \/ centro de custo de destino$/ }).waitFor();
  await page.getByText('Departamento Pessoal QA · Centro de custo', { exact: true }).waitFor();
  await page.getByLabel(/^Obra \/ centro de custo de destino/).selectOption('31');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await page.getByText('Comercial QA · Centro de custo', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(reportFilters.at(-1), '31');
  await page.goto(base + '/qa-relatorio-destinos?config');
  await page.getByLabel('Todas as obras e centros de custo elegíveis').uncheck();
  await page.getByLabel('Pesquisar obras e centros de custo').fill('Departamento');
  await page.getByRole('checkbox', { name: /RH · Departamento Pessoal QA · Centro de custo/ }).check();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.waitForFunction(() => window.fechouConfig === true);
  assert.deepEqual(configs, [{ obras_ids: [31] }]);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('UI real: Administrativo como origem, dois centros como destinos, percentual/valor/TODAS, validacao, retry preservado e duplo envio, payload unico, relatorio/filtro e 390/1366 aprovados. API isolada.');
} catch (error) { console.error({ unexpected, errors, posts, body: (await page.locator('body').innerText()).slice(-2600) }); throw error; }
finally { if (typeof liberarPost === 'function') liberarPost(); await browser.close(); await server.close(); }
