import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizarPeriodoRegistro, lerConsultaSessao, salvarConsultaSessao } from '../src/pages/Solicitacoes/consultaSessao.js';
import { parseDateSmart } from '../src/utils/dateLocal.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'src/pages/Solicitacoes/index.jsx'), 'utf8');
const validation = index.slice(index.indexOf('function validarDataIso('), index.indexOf('const ROTULOS_VISAO_PENDENCIA'));
const ctx = vm.createContext({}); vm.runInContext(validation, ctx);
const erros = f => ctx.obterErrosFiltrosData(f);
assert.equal(normalizarPeriodoRegistro({ data_registro: '2026-10-01' }).data_inicio, '2026-10-01');
assert.equal(normalizarPeriodoRegistro({ data_registro: '2026-10-01' }).data_fim, '2026-10-01');
assert.equal(normalizarPeriodoRegistro({ data_registro: '2026-01-01', data_inicio: '2026-10-01' }).data_registro, '');
assert.equal(normalizarPeriodoRegistro({ data_inicio: '2026-10-01' }).data_fim, '');
assert.equal(normalizarPeriodoRegistro({ data_fim: '2026-10-02' }).data_inicio, '');
for (const f of [{}, { data_inicio: '2026-10-01' }, { data_fim: '2026-10-01' },
  { data_inicio: '2026-10-01', data_fim: '2026-10-01', data_vencimento_inicio: '2026-01-01', data_vencimento_fim: '2026-06-30' }]) {
  assert.equal(Object.keys(erros(f)).length, 0);
}
for (const f of [{ data_inicio: '2026-02-30' }, { data_fim: '0226-01-01' },
  { data_inicio: '2026-10-02', data_fim: '2026-10-01' },
  { data_vencimento_inicio: '2026-10-02', data_vencimento_fim: '2026-10-01' }]) assert(Object.keys(erros(f)).length);
const map = new Map(), storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
const user = { id: 17, areas_permissoes: ['solicitacoes.visualizar'] };
salvarConsultaSessao(user, false, { filtros: { data_inicio: '2026-10-01', data_fim: '2026-10-02',
  data_vencimento_inicio: '2026-01-01', status: 'PENDENTE', token: 'NAO_SALVAR' } }, storage);
let restored = lerConsultaSessao(user, false, '', storage);
assert.equal(restored.filtros.data_inicio, '2026-10-01');assert.equal(restored.filtros.data_fim, '2026-10-02');
assert.equal(restored.filtros.data_vencimento_inicio, '2026-01-01');assert.equal(restored.filtros.status, 'PENDENTE');
assert(!JSON.stringify(restored).includes('NAO_SALVAR'));
for (const q of ['?data_inicio=2026-10-01', '?data_fim=2026-10-02', '?data_registro=2026-10-01']) {
  assert.equal(lerConsultaSessao(user, false, q, storage), null);
}
assert.equal(lerConsultaSessao(user, true, '', storage), null);
assert.equal(lerConsultaSessao({ ...user, id: 18 }, false, '', storage), null);
assert.equal(lerConsultaSessao({ ...user, areas_permissoes: [] }, false, '', storage), null);
salvarConsultaSessao(user, false, { filtros: { data_registro: '2026-10-01' } }, storage);
restored = lerConsultaSessao(user, false, '', storage);
assert.equal(restored.filtros.data_inicio, '2026-10-01');assert.equal(restored.filtros.data_fim, '2026-10-01');
assert.equal(restored.filtros.data_registro, '');
// O filtro local de live updates deve refletir o periodo usado no GET.
const local = vm.createContext({ filtros: { data_inicio: '2026-10-01', data_fim: '2026-10-02', status: 'PENDENTE',
  data_vencimento_inicio: '2026-01-01', data_vencimento_fim: '2026-06-30' },
  filtroIdsUrl: [], setoresMap: {}, parseDateSmart,
  obterIdsFiltro: v => String(v || '').split(',').filter(Boolean),
  normalizarStatus: v => String(v).toUpperCase(), normalizarTextoComparacao: v => String(v || '').toUpperCase(),
  obterValorListaSolicitacao: r => Number(r.valor) });
vm.runInContext(index.slice(index.indexOf('function formatarDataParaFiltro('), index.indexOf('function moeda(')) +
  index.slice(index.indexOf('  function solicitacaoAtendeFiltros('), index.indexOf('  function registrarMutacaoLocal(')), local);
const item = { id: 1, createdAt: '2026-10-02T12:00:00', data_vencimento: '2026-05-10', status_global: 'PENDENTE', valor: 100 };
assert(local.solicitacaoAtendeFiltros(item));
assert(!local.solicitacaoAtendeFiltros({ ...item, createdAt: '2026-10-03T00:00:00' }));
assert(!local.solicitacaoAtendeFiltros({ ...item, createdAt: null }));
assert(!local.solicitacaoAtendeFiltros({ ...item, data_vencimento: '2026-07-01' }));
assert(!local.solicitacaoAtendeFiltros({ ...item, status_global: 'PAGA' }));
const exportsQueries = [];
const exportsCtx = vm.createContext({ filtros: local.filtros, filtroIdsUrl: [], filtroVisaoUrl: '', arquivadas: false,
  EXPORT_PAGE_SIZE: 200, API_URL: '/api', URLSearchParams, authHeaders: () => ({}),
  aplicarConsultaListaNosParams: () => {}, fetch: async url => {
    exportsQueries.push(Object.fromEntries(new URL(url, 'http://local').searchParams));
    return { ok: true, json: async () => ({ items: [item], meta: { total_pages: 1 } }) };
  } });
vm.runInContext(index.slice(index.indexOf('  async function buscarTodasSolicitacoesFiltradas('),
  index.indexOf('  async function exportarSolicitacoesExcel(')) + '\nresultado=buscarTodasSolicitacoesFiltradas();', exportsCtx);
await exportsCtx.resultado;
assert.equal(exportsQueries[0].limit, '200');assert.equal(exportsQueries[0].data_inicio, '2026-10-01');
assert.equal(exportsQueries[0].data_fim, '2026-10-02');assert.equal(exportsQueries[0].data_vencimento_fim, '2026-06-30');
console.log('OK: periodo/validacao/frontend, legado para dia unico, sessao/URL/usuario/escopo e allowlist. Sem API/DB.');

export async function validarPeriodoRegistroUI({ browser, base, install }) {
  const out = path.join(root, '../outputs/solicitacoes-periodo-registro-20261021');fs.mkdirSync(out, { recursive: true });
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const audit = await install(page);const queries = [];
    await page.addInitScript(() => {
      // Exibe apenas os recortes em teste, preservando o contrato real de preferencias.
      localStorage.setItem('solicitacoes:filtros-visiveis:1', JSON.stringify(['descricao', 'data_registro', 'data_vencimento', 'status']));
    });
    const fixture = [
      { id: 90, createdAt: '2026-10-01T00:00:00', status_global: 'PENDENTE' },
      { id: 91, createdAt: '2026-10-02T23:59:59', status_global: 'PENDENTE' },
      { id: 92, createdAt: '2026-10-03T00:00:00', status_global: 'PENDENTE' },
      { id: 93, createdAt: '2026-10-02T12:00:00', status_global: 'PAGA' }
    ].map(r => ({ ...r, codigo: 'SOL-QA' + r.id, valor: 1000, descricao: 'Solicitacao QA',
      area_responsavel: 'GEO', obra_id: 7, obra: { id: 7, nome: 'Obra QA' },
      data_vencimento: '2026-05-10', interacoes_pendentes: [] }));
    await page.route('**/api/solicitacoes?*', route => {
      const q = Object.fromEntries(new URL(route.request().url()).searchParams);queries.push(q);
      const items = fixture.filter(r => (!q.data_inicio || r.createdAt.slice(0, 10) >= q.data_inicio) &&
        (!q.data_fim || r.createdAt.slice(0, 10) <= q.data_fim) && (!q.status || r.status_global === q.status));
      return route.fulfill({ json: { items, meta: { page: 1, total: items.length, total_pages: 1, limit: 25 } } });
    });
    const open = async () => {
      if (width < 768 && !(await page.getByRole('button', { name: /Mais filtros/ }).isVisible())) {
        await page.getByRole('button', { name: /^Filtrar/ }).click();
      }
      if (!(await page.getByLabel('Data de registro de', { exact: true }).isVisible())) {
        await page.getByRole('button', { name: /Mais filtros/ }).click();
      }
      // Fechar o menu mobile de filtros rapidos antes de operar o painel abaixo.
      if (width < 768) await page.locator('.la-busca input').click();
    };
    const input = name => page.getByLabel(name, { exact: true });
    const fill = async (name, value) => { await input(name).fill(value);await input(name).blur(); };
    try {
      await page.goto(base + '/solicitacoes?data_inicio=2026-10-01&data_fim=2026-10-02&status=PENDENTE&data_vencimento_inicio=2026-01-01&data_vencimento_fim=2026-06-30');
      await page.getByRole('link', { name: 'SOL-QA91', exact: true }).waitFor();await open();
      assert.equal(await input('Data de registro de').inputValue(), '01/10/2026');
      assert.equal(await input('Data de registro até').inputValue(), '02/10/2026');
      assert.equal(await page.getByRole('link', { name: 'SOL-QA92', exact: true }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'SOL-QA93', exact: true }).count(), 0);
      assert(queries.some(q => q.data_inicio === '2026-10-01' && q.data_fim === '2026-10-02' &&
        q.status === 'PENDENTE' && q.data_vencimento_inicio === '2026-01-01' && q.data_vencimento_fim === '2026-06-30' && !q.data_registro));
      await page.screenshot({ path: path.join(out, `periodo-${width}.png`), fullPage: true });
      for (const name of ['Data de registro de', 'Data de registro até']) {
        assert(await input(name).evaluate(el => { const r = el.getBoundingClientRect();return r.left >= 0 && r.right <= innerWidth + 1; }));
      }
      await fill('Data de registro até', '');await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('solicitacoes:consulta-sessao:1:ativas'))?.filtros.data_fim === '');
      await page.getByRole('link', { name: 'SOL-QA92', exact: true }).waitFor();
      await fill('Data de registro de', '');await fill('Data de registro até', '02/10/2026');
      await page.getByRole('link', { name: 'SOL-QA92', exact: true }).waitFor({ state: 'detached' });
      assert(queries.some(q => !q.data_inicio && q.data_fim === '2026-10-02'));
      await fill('Data de registro de', '03/10/2026');
      await page.getByText('A data de registro final deve ser igual ou posterior a inicial.', { exact: true }).waitFor();
      const qtd = queries.length;await page.waitForTimeout(650);assert.equal(queries.length, qtd, 'Periodo invertido nao consulta');
      await fill('Data de registro de', '02/10/2026');
      await page.getByRole('link', { name: 'SOL-QA90', exact: true }).waitFor({ state: 'detached' });
      await page.goto(base + '/solicitacoes');await page.getByRole('link', { name: 'SOL-QA91', exact: true }).waitFor();await open();
      assert.equal(await input('Data de registro de').inputValue(), '02/10/2026');
      assert.equal(await input('Data de registro até').inputValue(), '02/10/2026');
      await page.getByRole('button', { name: /Filtros visíveis/ }).click();
      await page.getByRole('checkbox', { name: /^Período de registro/ }).uncheck();
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'SOL-QA92', exact: true }).waitFor();
      assert.equal(await input('Data de registro de').count(), 0);
      assert(!queries.at(-1).data_inicio && !queries.at(-1).data_fim && !queries.at(-1).data_registro);
      await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
      await page.getByRole('link', { name: 'SOL-QA93', exact: true }).waitFor();
      assert(!queries.at(-1).data_vencimento_inicio && !queries.at(-1).data_vencimento_fim && !queries.at(-1).status);
      await page.goto(base + '/solicitacoes?data_registro=2026-10-02');
      await page.getByRole('link', { name: 'SOL-QA91', exact: true }).waitFor();await open();
      assert.equal(await input('Data de registro de').inputValue(), '02/10/2026');
      assert.equal(await input('Data de registro até').inputValue(), '02/10/2026');
      assert(queries.some(q => q.data_inicio === '2026-10-02' && q.data_fim === '2026-10-02' && !q.data_registro));
      await page.goto(base + '/solicitacoes?data_inicio=2026-10-01');
      await page.getByRole('link', { name: 'SOL-QA92', exact: true }).waitFor();await open();
      assert.equal(await input('Data de registro até').inputValue(), '', 'URL explicita nao herda ponta salva');
      assert.deepEqual(audit.errors, []);
      assert(!audit.writes.some(w => !w.p.includes('preferencias')), 'Nenhuma escrita de negocio');
      console.log(`OK periodo registro UI ${width}: consulta combinada, limites, pontas, inversao, sessao e esconder limpa ambas. Sem API/DB externos.`);
    } catch (e) { await page.screenshot({ path: path.join(out, `falha-${width}.png`), fullPage: true });throw e; }
    finally { await page.close(); }
  }
}
