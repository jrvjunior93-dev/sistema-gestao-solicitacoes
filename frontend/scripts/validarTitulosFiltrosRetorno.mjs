// Paginas, preferencias, router, workspace e services HTTP reais. API ficticia
// em memoria do navegador; nenhuma chamada ao ambiente do usuario.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/titulos-filtros-retorno'); fs.mkdirSync(output, { recursive: true });
const fixture = `import React,{useMemo}from'react';import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route,Link,useLocation}from'react-router-dom';
import List from'/src/pages/FinanceiroTitulos.jsx';import Detail from'/src/pages/FinanceiroTituloDetalhe.jsx';
import{PreferenciasProvider}from'/src/contexts/PreferenciasContext.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import{WorkspaceContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import WorkspaceView from'/src/navigation/WorkspaceView.jsx';import useController from'/src/navigation/useWorkspaceController.js';
import{caminhoRetornoTitulos}from'/src/navigation/useRetornoTitulos.js';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';
window.qa={reads:[],writes:[],prefs:JSON.parse(sessionStorage.getItem('qa:serverprefs')||'{}'),releasePrefs:null,unknown:[],denied:false};
window.qa.retorno=caminhoRetornoTitulos;
const user={id:912345,perfil:'SUPERADMIN',area:'FINANCEIRO'};
const title=id=>({id,codigo:'TIT-QA-'+id,tipo:id===800?'RECEBER':'PAGAR',status:'ABERTO',valor_original:100,valor_saldo:100,valor_baixado:0,
 descricao:'Titulo local QA',solicitacao_id:999,solicitacao:{id:999,codigo:'SOL-650'},obra_id:10,obra:{id:10,nome:'Obra QA'},
 parceiro:{id:1,nome:'Parceiro QA'},data_vencimento:'2026-10-27',data_emissao:'2026-10-27',movimentos:[],paymentIntents:[]});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,opts={})=>{
 const u=new URL(input,location.origin),p=u.pathname.replace(/^\\/api/,'');const method=opts.method||'GET';
 if(method!=='GET'){
   const match=p.match(/^\\/listas\\/(.+)\\/preferencias\\/(.+)$/);
   if(!match){window.qa.unknown.push(method+' '+p);return response({error:'Escrita bloqueada na fixture'},403);}
   const lista=decodeURIComponent(match[1]),tipo=match[2],valor=opts.body?JSON.parse(opts.body).preferencias:null;
   window.qa.writes.push({lista,tipo,valor});window.qa.prefs[lista]||={};
   if(method==='DELETE')delete window.qa.prefs[lista][tipo];else window.qa.prefs[lista][tipo]=valor;
   sessionStorage.setItem('qa:serverprefs',JSON.stringify(window.qa.prefs));
   return response({preferencias:valor});
 }
 window.qa.reads.push({p,q:Object.fromEntries(u.searchParams)});
 if(p==='/me/preferencias'){
   const old={listas:{'tabela:financeiro-titulos:pagar':{filtros:{visiveis:['q','status','obra_id','vencimento_inicial','vencimento_final'],ocultas:['solicitacao_codigo','numero_documento']},geral:{valores:{tipo:'PAGAR',solicitacao_codigo:'ANTIGO'}}}},total:1};
   const data=Object.keys(window.qa.prefs).length?{listas:structuredClone(window.qa.prefs),total:1}:old;
   await new Promise(resolve=>{window.qa.releasePrefs=resolve;});return response(data);
 }
 if(p==='/financeiro/titulos'){
   if(window.qa.denied)return response({error:'Sem permissao'},403);
   const page=Number(u.searchParams.get('page')||1),tipo=u.searchParams.get('tipo'),limit=Number(u.searchParams.get('limit')||25);
   const data=tipo==='RECEBER'?[title(800)]:Array.from({length:Math.min(limit,60-(page-1)*limit)},(_,i)=>title((page-1)*limit+i+1));
   return response({data,pagination:{page,limit,total:tipo==='RECEBER'?1:60,total_pages:tipo==='RECEBER'?1:Math.ceil(60/limit)}});
 }
 if(/^\\/financeiro\\/titulos\\/\\d+$/.test(p))return response(title(Number(p.split('/').pop())));
 if(p.endsWith('/tema'))return response({tema:TEMA_PADRAO});
 return response([]);
};
function Frame(){const w=useController(user),memory=useMemo(()=>createWorkspaceMemory(),[]),loc=useLocation();window.qa.workspace=w;window.qa.memory=memory;
return <WorkspaceContext.Provider value={w}><nav><Link to='/financeiro/titulos?tipo=pagar'>Carteira Pagar QA</Link><Link to='/financeiro/titulos?tipo=receber'>Carteira Receber QA</Link></nav><output data-route>{loc.pathname+loc.search}</output><WorkspaceView workspace={w} memory={memory}/></WorkspaceContext.Provider>;}
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><PreferenciasProvider><MemoryRouter initialEntries={['/financeiro/titulos?tipo=pagar']}><Routes><Route element={<Frame/>}><Route path='/financeiro/titulos' element={<List/>}/><Route path='/financeiro/titulos/:id' element={<Detail/>}/></Route></Routes></MemoryRouter></PreferenciasProvider></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'), server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'titulos-retorno-fixture', enforce: 'pre',
  resolveId(id) { if (id === '/fixture.jsx') return '\0titulos-retorno.jsx'; },
  load(id) { if (id === '\0titulos-retorno.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
  transform(code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return "export const useAuth=()=>({authReady:true,isAuthenticated:true,user:{id:912345,perfil:'SUPERADMIN',area:'FINANCEIRO'}});";
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  }); }
}, react()] });
let browser; const errors = [], external = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const width = process.argv.includes('--mobile') ? 390 : 1366;
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue(); external.push(route.request().url()); return route.abort(); });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
  await page.getByRole('heading', { name: 'Contas a Pagar', exact: true }).waitFor();
  await page.getByRole('button', { name: /Filtros visíveis/ }).click();
  await page.getByRole('checkbox', { name: 'Código da solicitação', exact: true }).check();
  await page.getByRole('checkbox', { name: 'N. documento', exact: true }).check();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('SOL-5426 ou 5426').fill('SOL-650');
  await page.waitForFunction(() => window.qa.writes.some(w => w.tipo === 'filtros'));
  // Resposta velha chega depois da escolha e do PUT; nao deve esconder campo.
  await page.evaluate(() => window.qa.releasePrefs());
  await page.getByPlaceholder('SOL-5426 ou 5426').waitFor();
  assert.equal(await page.getByPlaceholder('SOL-5426 ou 5426').inputValue(), 'SOL-650');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('link', { name: 'TIT-QA-1', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.qa.reads.filter(r => r.p === '/financeiro/titulos').at(-1).q.solicitacao_codigo), 'SOL-650');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).click();
  await page.getByRole('heading', { name: 'Titulo TIT-QA-26', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Voltar para títulos', exact: true }).getAttribute('href'), '/financeiro/titulos?tipo=pagar');
  await page.getByRole('link', { name: 'Voltar para títulos', exact: true }).click();
  await page.getByRole('heading', { name: 'Contas a Pagar', exact: true }).waitFor();
  await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder('SOL-5426 ou 5426').inputValue(), 'SOL-650');
  await page.getByRole('link', { name: 'Carteira Receber QA', exact: true }).click();
  await page.getByRole('heading', { name: 'Contas a Receber', exact: true }).waitFor();
  await page.getByRole('button', { name: /Filtros visíveis/ }).click();
  await page.getByRole('checkbox', { name: 'Código da solicitação', exact: true }).check();
  await page.keyboard.press('Escape'); await page.getByPlaceholder('SOL-5426 ou 5426').fill('999');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('link', { name: 'TIT-QA-800', exact: true }).click();
  await page.getByRole('heading', { name: 'Titulo TIT-QA-800', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Voltar para títulos', exact: true }).click();
  assert.equal(await page.getByPlaceholder('SOL-5426 ou 5426').inputValue(), '999');
  await page.getByRole('link', { name: 'Carteira Pagar QA', exact: true }).click();
  await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder('SOL-5426 ou 5426').inputValue(), 'SOL-650');
  await page.getByRole('button', { name: /Filtros visíveis/ }).click();
  assert(await page.getByRole('checkbox', { name: 'N. documento', exact: true }).isChecked());
  await page.keyboard.press('Escape');
  if (width > 600) {
    await page.getByTitle('Ordenar por Título', { exact: true }).click();
    await page.waitForFunction(() => {const q=window.qa.reads.filter(r=>r.p==='/financeiro/titulos').at(-1).q;return q.page==='1'&&q.ordenar_por==='titulo';});
    await page.getByRole('button', { name: 'Próxima', exact: true }).click();
    await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).click();
    await page.getByRole('link', { name: 'Voltar para títulos', exact: true }).click();
    await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).waitFor();
  }
  // Esconder limpa criterio aplicado e nao ressuscita ao abrir/voltar.
  await page.getByRole('button', { name: /Filtros visíveis/ }).click();
  await page.getByRole('checkbox', { name: /^Código da solicitação/ }).uncheck(); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.qa.reads.filter(r => r.p === '/financeiro/titulos').at(-1).q.solicitacao_codigo);
  await page.waitForFunction(() => window.qa.writes.filter(w=>w.tipo==='filtros'&&w.lista.endsWith(':pagar')).at(-1).valor.ocultas.includes('solicitacao_codigo'));
  await page.waitForFunction(() => !window.qa.prefs['tabela:financeiro-titulos:pagar'].geral?.valores.solicitacao_codigo);
  await page.evaluate(() => window.qa.denied = true);
  await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).click();
  await page.getByRole('link', { name: 'Voltar para títulos', exact: true }).click();
  await page.getByText('Sem permissao', { exact: true }).waitFor(); assert.equal(await page.getByRole('link', { name: 'TIT-QA-26', exact: true }).count(), 0);
  // Link correto tambem apos edicao e em aba filha; sem retorno para editar.
  const routes = await page.evaluate(() => {
    const entries = [{ id: 'l', route: '/financeiro/titulos?tipo=pagar&q=teste' }, { id: 'd', route: '/financeiro/titulos/26' }, { id: 'e', route: '/financeiro/titulos/26/editar' }, { id: 'd2', route: '/financeiro/titulos/26' }];
    const parent = { id: 'p', entries, cursor: 3 };
    return [window.qa.retorno({ tabs: [parent], activeId: 'p' }, 'PAGAR'), window.qa.retorno({ tabs: [parent, { id: 'c', entries: [], cursor: 0, origin: { tabId: 'p', entryId: 'l' } }], activeId: 'c' }, 'PAGAR'), window.qa.retorno(null, 'PAGAR'), window.qa.retorno(null, 'RECEBER')];
  });
  assert.deepEqual(routes, ['/financeiro/titulos?tipo=pagar&q=teste', '/financeiro/titulos?tipo=pagar&q=teste', '/financeiro/titulos?tipo=pagar', '/financeiro/titulos?tipo=receber']);
  assert.deepEqual(await page.evaluate(() => window.qa.unknown), []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
  // Nova montagem do Provider: espelho e servidor ficticio concordam com a
  // ultima escolha. Nenhum dado produtivo e acessado ou serializado.
  await page.reload(); await page.getByRole('heading', { name: 'Contas a Pagar', exact: true }).waitFor();
  await page.waitForFunction(() => typeof window.qa.releasePrefs === 'function');
  await page.evaluate(() => window.qa.releasePrefs());
  await page.getByRole('button', { name: /Filtros visíveis/ }).click();
  assert(await page.getByRole('checkbox', { name: 'N. documento', exact: true }).isChecked());
  assert(!(await page.getByRole('checkbox', { name: /^Código da solicitação/ }).isChecked()));
  await page.screenshot({ path: path.join(output, 'filtros-' + width + '.png') });
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log('PASS '+width+'px: paginas reais, codigo nas duas carteiras, retorno na pagina2, ordenacao, filtros/visibilidade/reload, GET atrasado, permissao revogada e nenhum endpoint financeiro de escrita.');
} catch (error) {
  if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) { fs.writeFileSync(path.join(output, 'falha.txt'), await page.locator('body').innerText()); fs.writeFileSync(path.join(output, 'erros.json'), JSON.stringify(errors)); } }
  throw error;
} finally { await browser?.close(); await server.close(); }
