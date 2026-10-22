// Pagina/services reais com HTTP interceptado; sem backend, DB ou EC2 reais.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chaveGrupoOfx, projetarMatchesOfx } from '../src/utils/conciliacaoAlocacao.js';

const banco = id => ({ id, status: 'PENDENTE', conta_bancaria_id: 9, valor: -100,
  data_movimento: '2026-10-22', descricao_banco: `Banco QA ${id}`, conta_bancaria_nome: 'Conta QA' });
const mov = id => ({ movimento_financeiro_id: id, titulo_financeiro_id: 77, titulo_codigo: 'TIT-009077',
  titulo_descricao: `Compra QA ${id}`, parceiro_nome: 'Fornecedor QA', tipo: 'PAGAR',
  valor_quitacao: 100, data_movimento: '2026-10-22', obra_nome: 'Obra QA' });
const chave = chaveGrupoOfx(banco(1));
const grupo = (ids = [1, 2, 3], candidatos = [mov(101), mov(102)], confirmado = false) =>
  ({ chave, pendentes_ids: ids, candidatos, tem_match_confirmado: confirmado });
const manual = (id = 101) => ({ grupo: chave, origem: 'SUGESTAO', movimentoIds: [id], movimentos: [mov(id)], total: 100 });
let p = projetarMatchesOfx([banco(1), banco(2)], [grupo([1, 2], [mov(101)])]);
assert(p.itens.every(i => i.total_candidatos_exatos_mesmo_dia === 1 && i.associacao_manual_recomendada));
assert.equal(Object.keys(p.preparadas).length, 0);
p = projetarMatchesOfx([banco(1), banco(2), banco(3)], [grupo()], { 1: manual() });
assert.deepEqual(p.preparadas[2].movimentoIds, [102]); assert.equal(p.itens[2].sugestoes.length, 0);
assert.equal(p.reservados.size, 2);
p = projetarMatchesOfx([banco(3)], [grupo()], { 1: manual() });
assert.deepEqual(p.preparadas[2].movimentoIds, [102], 'Reserva mantida fora da pagina');
assert.equal(p.itens[0].sugestoes.length, 0);
p = projetarMatchesOfx([banco(1), banco(2), banco(3)], [grupo()], { 1: manual() }, [2]);
assert(p.preparadas[3].automatica); assert(!p.preparadas[2]);
p = projetarMatchesOfx([banco(1), banco(2), banco(3)], [grupo()]);
assert(p.itens.every(i => i.total_candidatos_exatos_mesmo_dia === 2), 'Liberar devolve candidatos');
p = projetarMatchesOfx([banco(2), banco(3)], [grupo([2, 3], [mov(102)], true)], { 1: manual() });
assert(!p.preparadas[1]); assert(p.preparadas[2].automatica);
p = projetarMatchesOfx([banco(1), banco(2)], [grupo([1, 2])], { 1: manual(), 2: manual() });
assert.equal(p.preparadas[2].movimentoIds[0], 102, 'Entrada duplicada e descartada, sobra outro movimento do mesmo titulo');
const input = { itens: [banco(1)], grupos: [grupo([1], [mov(101)])], preparadas: {} }, antes = JSON.stringify(input);
projetarMatchesOfx(input.itens, input.grupos, input.preparadas); assert.equal(JSON.stringify(input), antes);
assert.notEqual(chaveGrupoOfx({ ...banco(1), valor: 100 }), chave);
assert.notEqual(chaveGrupoOfx({ ...banco(1), conta_bancaria_id: 8 }), chave);
assert.notEqual(chaveGrupoOfx({ ...banco(1), data_movimento: '2026-10-21' }), chave);
const varios = Array.from({ length: 24 }, (_, i) => mov(i + 101));
assert.equal(projetarMatchesOfx([banco(1)], [grupo([1], varios)]).itens[0].total_candidatos_exatos_mesmo_dia, 24);
p = projetarMatchesOfx([banco(1), banco(2)], [grupo([1, 2])], {
  1: { ...manual(), origem: 'MANUAL', movimentoIds: [101, 102], movimentos: [mov(101), mov(102)], total: 200 }
});
assert.equal(p.reservados.size, 2); assert.equal(p.itens[1].sugestoes.length, 0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-ofx-matches', configureServer(vite) {
    vite.middlewares.use('/qa-matches', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/qa-matches', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{AuthContext}from'/src/contexts/AuthContext.jsx';import Page from'/src/pages/FinanceiroConciliacao.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';
const readonly=new URLSearchParams(location.search).has('readonly');
const user=readonly?{perfil:'OPERADOR',areas_permissoes:['financeiro.conciliacao.visualizar']}:{perfil:'SUPERADMIN'};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{user}},React.createElement(Page))));</script></body></html>`));
    });
  }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(12000);
// Primeira compilacao do Vite pode ser fria; as acoes/asserts continuam em12s.
page.setDefaultNavigationTimeout(45000);
let rows, candidates, confirmed, slow = false, release, conflict = false, lost = false, manuais = null;
const errors = [], unexpected = [], posts = [];
const reset = (n = 3, count = 2) => { rows = Array.from({ length: n }, (_, i) => banco(i + 1)); candidates = Array.from({ length: count }, (_, i) => mov(i + 101)); confirmed = false; };
reset();
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/financeiro/contas-bancarias')) return json([{ id: 9, nome: 'Conta QA', empresa_id: 2, banco: 'Banco QA', ativo: true }]);
  if (url.pathname.endsWith('/financeiro/tarifas-bancarias-atalhos')) return json([]);
  if (url.pathname.endsWith('/financeiro/conciliacoes/importacoes')) return json({ resumo: {}, itens: [] });
  if (/\/financeiro\/conciliacoes\/\d+\/movimentos$/.test(url.pathname)) {
    const id = Number(url.pathname.split('/').at(-2));
    const itens = manuais || candidates;
    return json({ conciliacao: rows.find(r => r.id === id), meta: { total: itens.length, limit: 30 }, itens });
  }
  if (/\/financeiro\/conciliacoes\/\d+\/confirmar$/.test(url.pathname)) {
    posts.push(req.postDataJSON()); const id = Number(url.pathname.split('/').at(-2));
    if (slow) await new Promise(resolve => { release = resolve; });
    const mid = posts.at(-1).movimento_financeiro_id;
    candidates = candidates.filter(c => c.movimento_financeiro_id !== mid); confirmed = true;
    if (conflict) return json({ error: 'Movimento já utilizado em outra conciliação QA' }, 409);
    rows = rows.map(r => r.id === id ? { ...r, status: 'CONCILIADO', titulo: { id: 77, codigo: 'TIT-009077', descricao: 'Compra QA confirmada' }, movimento: { id: mid } } : r);
    if (lost) return route.abort('failed');
    return json({ ok: true });
  }
  if (url.pathname.endsWith('/financeiro/conciliacoes')) {
    const pendentes = rows.filter(r => r.status === 'PENDENTE'), status = url.searchParams.get('status');
    return json({ resumo: { total: rows.length, pendentes: pendentes.length, conciliados: rows.length - pendentes.length },
      meta: { total_listado: rows.length, total_pages: 1, grupos_match: [grupo(pendentes.map(r => r.id), candidates, confirmed)] },
      itens: status === 'CONCILIADO' ? rows.filter(r => r.status === status) : status === 'TODOS' ? rows : pendentes });
  }
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-matches`;
const abrir = async (suffix = '') => { await page.goto(base + suffix); await page.getByRole('button', { name: 'Conferir manualmente', exact: true }).click(); await page.getByText('Banco QA 1', { exact: true }).waitFor(); };
// Localizar pelo texto do banco mantem o QA ligado ao card real, sem hooks no runtime.
const card = id => page.getByText(`Banco QA ${id}`, { exact: true }).locator('xpath=../../..');
const preparar = async (id, count = 2) => {
  const expandir = card(id).getByRole('button', { name: `+ ${count} ${count === 1 ? 'título compatível' : 'títulos compatíveis'}`, exact: true });
  if (await expandir.count()) await expandir.click();
  await card(id).getByRole('button', { name: 'Usar', exact: true }).first().click();
};
try {
  await abrir();
  assert.equal(await page.getByRole('button', { name: '+ 2 títulos compatíveis', exact: true }).count(), 3);
  await preparar(1); assert.equal(posts.length, 0);
  await card(1).getByText('TIT-009077', { exact: true }).waitFor();
  await card(2).getByText('Sugestão exclusiva preparada', { exact: true }).waitFor();
  await card(3).getByText('Nenhum lançamento equivalente encontrado', { exact: true }).waitFor();
  await card(3).getByRole('button', { name: 'Associar', exact: true }).click();
  await page.getByText('0 movimento(s) encontrado(s)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fechar', exact: true }).filter({ hasText: /^Fechar$/ }).click();
  assert(await card(3).getByRole('button', { name: 'Conciliar', exact: true }).isDisabled());
  await card(1).getByRole('button', { name: 'Liberar seleção', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '+ 2 títulos compatíveis', exact: true }).count(), 2);
  assert.equal(await card(1).getByRole('button', { name: 'Usar', exact: true }).count(), 2);
  await preparar(1);
  const output = path.resolve(root, '../outputs/ofx-matches-20261022'); fs.mkdirSync(output, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await card(1).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Sem overflow ${width}`);
    for (const nome of ['Ações', 'Associar', 'Fatura', 'Transferência']) {
      const rect = await card(1).getByRole('button', { name: nome, exact: true }).boundingBox();
      assert(rect.x >= 0 && rect.x + rect.width <= width, `Acao ${nome} acessivel ${width}`);
    }
    await page.screenshot({ path: path.join(output, `titulos-matches-${width}.png`), fullPage: true });
  }
  slow = true;
  await card(1).getByRole('button', { name: 'Conciliar', exact: true }).evaluate(el => { el.click(); el.click(); });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === '...'));
  assert.equal(posts.length, 1); release(); slow = false;
  await page.getByText('Banco QA 1', { exact: true }).waitFor({ state: 'detached' });
  await card(2).getByText('TIT-009077', { exact: true }).waitFor();
  await card(2).getByRole('button', { name: 'Conciliar', exact: true }).click();
  await page.getByText('Banco QA 2', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(posts.length, 2); assert.notEqual(posts[0].movimento_financeiro_id, posts[1].movimento_financeiro_id);
  await page.locator('select').filter({ has: page.locator('option[value="CONCILIADO"]') }).selectOption('CONCILIADO');
  await page.getByRole('button', { name: 'Atualizar lançamentos', exact: true }).click();
  await card(1).getByText('Compra QA confirmada', { exact: true }).waitFor();
  await card(1).getByText('TIT-009077', { exact: true }).waitFor();

  reset(2, 1); await abrir();
  assert.equal(await page.getByRole('button', { name: '+ 1 título compatível', exact: true }).count(), 2);
  await preparar(1, 1); conflict = true;
  await card(1).getByRole('button', { name: 'Conciliar', exact: true }).click();
  await page.getByText('Movimento já utilizado em outra conciliação QA', { exact: true }).waitFor();
  await card(1).getByText('Nenhum lançamento equivalente encontrado', { exact: true }).waitFor();
  assert.equal(posts.length, 3); conflict = false;

  reset(1, 1); await abrir(); lost = true;
  await card(1).getByRole('button', { name: 'Conciliar', exact: true }).click();
  await page.getByText('Banco QA 1', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(posts.length, 4, 'Resposta perdida nao repete POST'); lost = false;

  reset(2, 0); manuais = [{ ...mov(201), valor_quitacao: 60 }, { ...mov(202), valor_quitacao: 40 }];
  await abrir(); await card(1).getByRole('button', { name: 'Associar', exact: true }).click();
  await page.getByText('2 movimento(s) encontrado(s)', { exact: true }).waitFor();
  const modal = page.getByRole('heading', { name: 'Associação manual', exact: true }).locator('xpath=../../..');
  for (const checkbox of await modal.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: 'Preparar associação', exact: true }).click();
  await card(1).getByText('2 movimentos selecionados', { exact: true }).waitFor();
  assert.equal(await card(1).getByText('TIT-009077', { exact: true }).count(), 1, 'Codigo deduplicado, nao confundir movimentos parciais com titulos novos');
  await card(2).getByRole('button', { name: 'Associar', exact: true }).click();
  await page.getByText('0 movimento(s) encontrado(s)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fechar', exact: true }).filter({ hasText: /^Fechar$/ }).click();
  assert.equal(posts.length, 4); manuais = null;

  reset(2, 1); await abrir('?readonly');
  await page.getByRole('button', { name: '+ 1 título compatível', exact: true }).first().click();
  assert.equal(await page.getByRole('button', { name: 'Usar', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Conciliar', exact: true }).count(), 0);
  await card(1).getByText('TIT-009077', { exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK OFX UI real: codigos TIT, 2/1 e 3/2, preparar/liberar/realocar, sem POST ao preparar, dupla confirmacao bloqueada, 409 e resposta perdida sem retry, readonly, 1366/390. Helper: pagina oculta, >20, parciais por movimento e imutabilidade.');
} catch (error) {
  console.error({ errors, unexpected, body: await page.locator('body').innerText() }); throw error;
} finally { release?.(); await page.close(); await browser.close(); await server.close(); }
