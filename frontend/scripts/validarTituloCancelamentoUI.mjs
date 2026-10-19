// Componente/ACL reais. Transporte simulado; somente servidor local de teste.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/titulo-cancelamento-20261019'); mkdirSync(output, { recursive: true });
const entry = `import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Cancelar from'/src/components/financeiro/CancelarTitulo.jsx';
import{canCancelTitulosFinanceiros}from'/src/utils/acessoProduto.js';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';
const q=new URLSearchParams(location.search);window.writes=[];window.fail=false;
window.titulo={id:10,codigo:'TIT-QA',status:q.has('pago')?'QUITADO':'ABERTO',tipo:'PAGAR',valor_original:120,valor_saldo:120,valor_baixado:q.has('pago')?120:0,updatedAt:'2026-10-19T12:00:00.000Z',...(q.has('compartilhado')?{compartilhamento_id:1}:{})};
const user={perfil:'USUARIO',areas_permissoes_configuradas:!q.has('legado'),areas_permissoes:q.has('readonly')?['financeiro.titulos.editar','financeiro.titulos.excluir']:['financeiro.titulos.cancelar']};
function Host(){const[active,A]=useState(true),[titulo,T]=useState(window.titulo);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;
window.change=()=>{window.titulo={...window.titulo,updatedAt:'2026-10-19T13:00:00.000Z'};T(window.titulo)};
return <WorkspacePageContext.Provider value={{key:'cancelamento-qa',memory,snapshot:true,active:true}}>{active?<section className="p-4"><h1>Dados do título</h1><Cancelar titulo={titulo} permitido={canCancelTitulosFinanceiros(user)} onCancelado={()=>T({...window.titulo})}/></section>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Host/></ThemeContext.Provider></MemoryRouter>);`;
const mocks = `export async function cancelarTituloFinanceiro(id,data){window.writes.push({id,data:structuredClone(data)});await new Promise(r=>setTimeout(r,150));
if(window.fail)throw new Error('Título com autorização em andamento. Regularize antes de cancelar.');
window.titulo={...window.titulo,status:'CANCELADO',valor_saldo:0,cancelamento:{motivo:data.motivo,cancelado_em:'2026-10-19T12:30:00.000Z',usuario:{id:99,nome:'Operador QA'}}};return {status:'CANCELADO'}}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'cancelamento-qa-local', enforce: 'pre', resolveId(id) { if (id === '/fixture.jsx') return '\0cancelamento-qa.jsx'; },
  async load(id) { if (id === '\0cancelamento-qa.jsx') return transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
  transform(_code, id) { if (id.endsWith('/src/services/financeiro.js')) return mocks; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture',
      '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  }); }
}, react()] });
let browser; const errors = [], external = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  const goto = async (query = '') => { await page.goto(base + query); await page.getByRole('heading', { name: 'Dados do título' }).waitFor(); };
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const q of ['?readonly=1','?legado=1','?compartilhado=1']) {
      await goto(q); assert.equal(await page.getByRole('button', { name: 'Cancelar título', exact: true }).count(), 0);
    }
    await goto('?pago=1'); assert(await page.getByRole('button', { name: 'Cancelar título', exact: true }).isDisabled());
    await goto();
    const abrir = page.getByRole('button', { name: 'Cancelar título', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Cancelar título', exact: true });
    const confirmar = dialog.getByRole('button', { name: 'Confirmar cancelamento', exact: true });
    await abrir.click(); assert(await confirmar.isDisabled());
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await abrir.click(); await dialog.getByRole('button', { name: 'Manter título' }).click();
    await dialog.waitFor({ state: 'detached' }); assert.equal(await page.evaluate(() => window.writes.length), 0);
    await abrir.click(); await dialog.getByLabel('Motivo do cancelamento', { exact: true }).fill('Duplicidade conferida <script>não executar</script>');
    await page.evaluate(() => window.qaTab(false)); await page.getByText('Consulta auxiliar').waitFor();
    await page.evaluate(() => window.qaTab(true)); await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Motivo do cancelamento', { exact: true }).inputValue(), 'Duplicidade conferida <script>não executar</script>');
    await page.screenshot({ path: path.join(output, `confirmacao-${width}.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => { window.fail = true; });
    await confirmar.evaluate(el => { el.click(); el.click(); }); await dialog.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.writes.length), 1);
    assert.equal(await page.evaluate(() => window.titulo.status), 'ABERTO');
    await page.evaluate(() => { window.fail = false; }); await confirmar.click();
    await page.getByText('Título cancelado', { exact: true }).waitFor();
    const dados = await page.evaluate(() => ({ writes: window.writes, titulo: window.titulo }));
    assert.equal(dados.writes.length, 2); assert.equal(dados.writes[0].data.idempotency_key, dados.writes[1].data.idempotency_key);
    assert.equal(dados.titulo.valor_original, 120); assert.equal(dados.titulo.valor_baixado, 0); assert.equal(dados.titulo.valor_saldo, 0);
    assert.equal(await abrir.count(), 0); await page.getByText('Duplicidade conferida <script>não executar</script>', { exact: true }).waitFor();
    await page.getByText(/Operador QA/).waitFor();
    await goto(); await abrir.click(); await dialog.getByLabel('Motivo do cancelamento', { exact: true }).fill('Conferido QA');
    await page.evaluate(() => window.change()); await confirmar.click(); await dialog.getByRole('alert').filter({ hasText: 'O título mudou' }).waitFor();
    assert.equal(await page.evaluate(() => window.writes.length), 0);
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('OK UI desktop/mobile: permissao especifica, legado negado, pagos/compartilhados protegidos, motivo, Escape, manter titulo, rascunho, duplo clique, erro/retry, versao e historico escapado. Sem API real.');
} finally { await browser?.close(); await server.close(); }
