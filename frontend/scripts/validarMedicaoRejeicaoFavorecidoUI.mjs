import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = path.join(root, '../outputs/medicao-rejeicao-favorecido'); fs.mkdirSync(outputs, { recursive: true });
const medicao = { id: 9, numero: 2, aprovada_em: null, favorecido: { id: 11, nome: 'Anterior', cpf_cnpj: '222' },
  favorecido_chave_pix: 'pix-antigo', forma_pagamento: { id: 3, nome: 'PIX', tipo: 'PIX' }, anexos: [{ id: 1, nome_original: 'medicao.pdf', caminho_arquivo: '/medicao.pdf' }] };
const parcela = { id: 1, numero: 1, status: 'PREVISAO', valor: 1000, vencimento: '2026-11-01', titulo_valor_baixado: 0, titulo_financeiro_id: 101, medicao };
const fixture = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
import ModalMedicao from '/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx';import FavorecidoEditor from '/src/components/financeiro/FavorecidoEditor.jsx';
import FinanceiroTituloEditar from '/src/pages/FinanceiroTituloEditar.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
function App(){const[id,setId]=useState(9),[aberto,setAberto]=useState(true);window.trocar=()=>setId(10);window.salvos=0;
const readonly=location.search.includes('readonly'),approved=location.search.includes('approved'),rejectOnly=location.search.includes('reject-only');
if(location.search.includes('pagina-titulo'))return <MemoryRouter initialEntries={['/financeiro/titulos/101/editar']}><Routes><Route path="/financeiro/titulos/:id/editar" element={<FinanceiroTituloEditar/>}/></Routes></MemoryRouter>;
return <MemoryRouter><main className="p-3">{location.search.includes('titulo')?<FavorecidoEditor key={id} id={id} permitido={!readonly} onSalvo={()=>window.salvos++}/>:aberto?<ModalMedicao key={id}
medicao={{...${JSON.stringify(medicao)},id,aprovada_em:approved?'2026-10-01':null}} parcelas={[{...${JSON.stringify(parcela)},medicao:{...${JSON.stringify(medicao)},id}}]}
solicitacaoId={42} podeEditar={!readonly&&!rejectOnly} podeAprovar={!readonly&&!rejectOnly} podeEditarFavorecido={!readonly&&!rejectOnly} podeRejeitar={!readonly}
onSalvo={()=>window.salvos++} onFechar={()=>setAberto(false)}/>:<p role="status">Operação concluída. Atualize para conferir o saldo e enviar nova medição.</p>}</main></MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } }, server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'qa-medicao-rejeicao-favorecido', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-medicao.jsx'; },
    load(id) { if (id === '\0qa-medicao.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:9,perfil:'SUPERADMIN',setor:'GEO'}});`;
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';export const API_ORIGIN='https://fixture.invalid';
      export const authHeaders=(extra={})=>({'X-QA':'1',...extra});export const fileUrl=p=>p;export const getAuthToken=()=>null;
      export const getAuditSessionId=()=>null;export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(), erros = [], inesperadas = [], writes = [];
  page.on('pageerror', e => erros.push(e.message));
  let negar = false, negarConsultaRejeicao = false;
  await page.route('**/*', async route => {
    const r = route.request(), u = new URL(r.url());
    if (u.hostname === '127.0.0.1') return route.continue();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (/\/medicoes\/\d+\/rejeicao$/.test(u.pathname)) return negarConsultaRejeicao ? json({ error: 'Sem permissão para rejeitar.' }, 403) : json({ referencia: 'a'.repeat(64), pode_rejeitar: true });
    if (/\/medicoes\/\d+\/rejeitar$/.test(u.pathname) || /\/favorecido$/.test(u.pathname) && r.method() === 'PATCH') {
      assert.equal(r.headers()['content-type'], 'application/json'); assert.equal(r.headers()['x-qa'], '1');
      writes.push({ path: u.pathname, body: r.postDataJSON() });
      if (negar) return json({ error: 'Operação vinculada. Regularize antes de alterar.' }, 409);
      await new Promise(resolve => setTimeout(resolve, 100)); return json({ salvo: true, medicao_id: 9 });
    }
    if (/\/favorecido$/.test(u.pathname)) return json({ origem: u.pathname.includes('/medicoes/') ? 'MEDICAO' : 'TITULO',
      referencia: 'a'.repeat(64), pode_editar: true, unidades: [{ unidade_id: null, favorecido: { id: 11, nome: 'Anterior', cpf_cnpj: '222' },
        chave_pix: 'pix-antigo', dados_pagamento: 'dados antigos', forma_pagamento_id: 3, forma: { id: 3, nome: 'PIX', tipo: 'PIX' } }] });
    if (u.pathname.endsWith('/parceiros')) return json([{ id: 12, nome: 'Novo favorecido', cpf_cnpj: '333' }]);
    if (u.pathname.endsWith('/financeiro/titulos/101')) return json({ id: 101, codigo: 'TIT-011642', tipo: 'PAGAR', status: 'PREVISAO', origem_titulo: 'CONTRATO',
      obra_id: 7, parceiro_id: 10, parceiro: { id: 10, nome: 'Credor contratual' }, categoria_financeira_id: 1,
      categoriaFinanceira: { id: 1, nome: 'Insumos', considera_dre: false }, empresa_id: 5, descricao: 'Previsao contrato',
      valor_original: 1000, valor_saldo: 1000, valor_baixado: 0, valor_bruto: 1000, valor_liquido: 1000, forma_pagamento_id: 3,
      data_vencimento: '2026-11-01', data_emissao: '2026-10-23', competencia_data: '2026-10-01', movimentos: [], paymentIntents: [] });
    if (u.pathname.endsWith('/obras/minhas')) return json([{ id: 7, nome: 'Obra QA' }]);
    if (u.pathname.endsWith('/empresas-grupo')) return json([{ id: 5, nome: 'Empresa QA' }]);
    if (u.pathname.endsWith('/financeiro/categorias')) return json([{ id: 1, nome: 'Insumos', considera_dre: false }]);
    if (/apropriacoes|beneficiaries/.test(u.pathname) || u.pathname.endsWith('/financeiro/favorecidos')) return json([]);
    inesperadas.push(r.method() + ' ' + u.pathname); return json({ error: 'Rota nao prevista' }, 500);
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function carregar(q = '') { await page.goto(base + q); }
  async function naTela(locator) {
    return locator.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
        && (el.matches(':disabled') || el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)));
    });
  }
  async function editar() {
    await page.getByRole('button', { name: 'Editar favorecido', exact: true }).click();
    await page.getByRole('button', { name: 'Alterar favorecido', exact: true }).click();
    await page.getByRole('region', { name: 'Editar favorecido', exact: true }).getByRole('button', { name: 'Limpar', exact: true }).click();
    assert.equal(await page.getByLabel('Chave PIX do favorecido').inputValue(), '');
    await page.getByRole('combobox', { name: /Favorecido do pagamento/ }).fill('Novo');
    await page.getByRole('button', { name: /Novo favorecido/ }).click();
    await page.getByLabel('Chave PIX do favorecido').fill('pix-novo');
    await page.getByLabel('Motivo da alteração do favorecido').fill('Corrigir apos conferencia do documento');
    await page.getByRole('checkbox', { name: 'Conferi o favorecido e os dados para pagamento.' }).check();
  }
  async function confirmarFavorecido(cancelar = false) {
    await page.getByRole('button', { name: 'Salvar favorecido', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirmar favorecido' });
    await dialog.getByRole('button', { name: cancelar ? 'Cancelar' : 'Salvar favorecido', exact: true }).click();
  }
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 880 }); await carregar();
    const rodape = page.locator('[data-modal="rodape"]');
    const rejeitar = rodape.getByRole('button', { name: 'Rejeitar medição', exact: true });
    await rejeitar.waitFor();
    assert.equal(await page.getByTestId('modal-medicao').getByRole('button', { name: 'Rejeitar medição', exact: true }).count(), 0);
    assert.deepEqual(await rodape.getByRole('button').allTextContents(), ['Rejeitar medição', 'Salvar alteracoes', 'Aprovar medição']);
    assert(await rejeitar.evaluate(el => el.classList.contains('btn-danger')));
    const corAprovar = await page.getByTestId('aprovar-medicao').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(await page.getByRole('button', { name: 'Editar favorecido', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), corAprovar);
    assert.notEqual(await rejeitar.evaluate(el => getComputedStyle(el).backgroundColor), corAprovar);
    assert(await naTela(rejeitar));
    assert(await naTela(page.getByTestId('aprovar-medicao')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(outputs, `acoes-${width}.png`) });
    await editar();
    assert(await page.getByTestId('aprovar-medicao').isDisabled()); assert(await page.getByTestId('salvar-medicao').isDisabled());
    assert(await rejeitar.isDisabled());
    await page.screenshot({ path: path.join(outputs, `favorecido-${width}.png`) });
    const antes = writes.length; await confirmarFavorecido(true); assert.equal(writes.length, antes);
    await confirmarFavorecido(); await page.getByRole('status').filter({ hasText: 'Operação concluída' }).waitFor();
    assert.equal(writes.length, antes + 1); assert.equal(writes.at(-1).body.favorecido_id, 12);
    assert.equal(writes.at(-1).body.chave_pix, 'pix-novo'); assert.equal(writes.at(-1).body.confirmado, true);
    await carregar(); await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).click();
    assert(await page.getByTestId('aprovar-medicao').isDisabled());
    assert(await page.getByTestId('salvar-medicao').isDisabled());
    assert(await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).isDisabled());
    assert(await page.getByLabel('Motivo da rejeição').evaluate(el => document.activeElement === el));
    await page.getByLabel('Motivo da rejeição').fill('Servico nao realizado. Enviar nova medicao.');
    await page.getByRole('button', { name: 'Confirmar rejeição', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Rejeitar medição pendente', exact: true });
    await page.screenshot({ path: path.join(outputs, `rejeicao-${width}.png`) });
    const antesRej = writes.length; await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal(writes.length, antesRej);
    await page.getByRole('button', { name: 'Confirmar rejeição', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Rejeitar medição pendente', exact: true });
    await dialog.getByRole('button', { name: 'Rejeitar medição', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Operação concluída' }).waitFor();
    assert.equal(writes.length, antesRej + 1); assert(writes.at(-1).body.idempotency_key);
    assert.equal(writes.at(-1).body.referencia, 'a'.repeat(64));
  }
  // Rodape tambem existe para quem pode rejeitar, mas nao salvar/aprovar.
  await carregar('?reject-only');
  assert.equal(await page.locator('[data-modal="rodape"]').getByRole('button').count(), 1);
  await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).click();
  const antesVoltar = writes.length; await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  assert.equal(writes.length, antesVoltar);
  assert(await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).isEnabled());
  // Viewport baixo: rodape continua visivel; formulario rola sem empurra-lo.
  await page.setViewportSize({ width: 320, height: 568 }); await carregar();
  await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).waitFor();
  assert(await naTela(page.getByRole('button', { name: 'Rejeitar medição', exact: true })));
  await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).click();
  await page.getByLabel('Motivo da rejeição').waitFor();
  await page.screenshot({ path: path.join(outputs, 'rejeicao-corpo-320.png') });
  assert(await naTela(page.getByLabel('Motivo da rejeição')));
  assert(await naTela(page.getByTestId('salvar-medicao')));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Confirmar rejeição', exact: true }).scrollIntoViewIfNeeded();
  assert(await naTela(page.getByRole('button', { name: 'Confirmar rejeição', exact: true })));
  assert(await naTela(page.getByTestId('salvar-medicao')));
  // Erro de consulta aparece no corpo, sem esconder o acionador do rodape.
  await carregar(); negarConsultaRejeicao = true;
  await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).click();
  const erroRejeicao = page.getByRole('alert').filter({ hasText: 'Sem permissão para rejeitar' });
  await erroRejeicao.waitFor(); assert(await naTela(erroRejeicao));
  assert(await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).isEnabled());
  negarConsultaRejeicao = false;
  await page.setViewportSize({ width: 1366, height: 880 });
  // Titulo: transporte isolado, erro/retry preserva preenchimento e nova conferencia.
  await carregar('?titulo');
  assert(await page.getByRole('button', { name: 'Editar favorecido', exact: true }).evaluate(el => el.classList.contains('btn-outline')));
  await editar(); negar = true; await confirmarFavorecido();
  await page.getByRole('alert').filter({ hasText: 'Operação vinculada' }).waitFor();
  assert.equal(await page.getByLabel('Chave PIX do favorecido').inputValue(), 'pix-novo');
  negar = false; await confirmarFavorecido(); await page.getByRole('status').filter({ hasText: 'atualizados' }).waitFor();
  assert.match(writes.at(-1).path, /financeiro\/titulos\/9\/favorecido/);
  await carregar('?readonly'); assert.equal(await page.getByRole('button', { name: 'Editar favorecido', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).count(), 0);
  await carregar('?approved'); assert.equal(await page.getByRole('button', { name: 'Rejeitar medição', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Editar favorecido', exact: true }).count(), 0);
  // Alvo trocado com confirmacao aberta nao pode escrever no novo/antigo registro.
  await carregar('?titulo'); await editar(); const antesTroca = writes.length;
  await page.getByRole('button', { name: 'Salvar favorecido', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirmar favorecido' }).waitFor();
  await page.evaluate(() => window.trocar());
  await page.getByRole('dialog', { name: 'Confirmar favorecido' }).waitFor({ state: 'detached' });
  assert.equal(writes.length, antesTroca); assert.deepEqual(erros, []); assert.deepEqual(inesperadas, []);
  // Integracao na pagina original de edicao (nao so no componente isolado).
  await carregar('?pagina-titulo'); await page.getByRole('heading', { name: 'Editar titulo TIT-011642' }).waitFor();
  await editar(); assert(await page.getByRole('button', { name: 'Salvar alteracoes', exact: true }).isDisabled());
  await confirmarFavorecido(); await page.getByRole('status').filter({ hasText: 'atualizados' }).waitFor();
  assert.equal(writes.at(-1).path, '/api/financeiro/titulos/101/favorecido');
  assert(!('valor' in writes.at(-1).body) && !('parceiro_id' in writes.at(-1).body));
  await editar(); const antesRascunho = writes.length;
  await page.locator('form input[value="Previsao contrato"]').fill('Rascunho do titulo preservado');
  assert(await page.getByRole('button', { name: 'Salvar favorecido', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Cancelar edição', exact: true }).click();
  assert.equal(await page.locator('form input[value="Rascunho do titulo preservado"]').inputValue(), 'Rascunho do titulo preservado');
  assert.equal(writes.length, antesRascunho, 'Cancelar editor nao envia o formulario financeiro');
  assert.deepEqual(erros, []); assert.deepEqual(inesperadas, []);
  console.log('OK UI real1366/390: medicao/titulo, busca favorecido, PIX antigo limpo, confirmacao/cancelamento, bloqueio aprovar/salvar, rejeicao, payload JSON, retry409, readonly/aprovada e troca de registro. Sem rede externa.');
} finally { if (browser) await browser.close(); await server.close(); }
