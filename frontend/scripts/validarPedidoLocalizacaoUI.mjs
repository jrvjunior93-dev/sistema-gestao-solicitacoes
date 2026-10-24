// Pagina, filtros, tabela, cliente HTTP e controller reais. Apenas sessao/tema
// sao adaptadores; banco SQLite ficticio em memoria. Nenhuma API externa.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import {csvPedidosLocalizados} from '../src/utils/pedidoLocalizacaoCsv.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {fixture}=require('../../backend/scripts/fixtures/pedidoLocalizacaoFixture.cjs');
const {createController}=require('../../backend/src/controllers/PedidoLocalizacaoController.js');
const f=fixture(60),calls=[],external=[],errors=[];let uiOrigin,deny=false;
const auth={canViewComprasPedidos:async()=>!deny,canViewComprasRelatorios:async()=>true,getComprasVisibilityScope:async()=> 'ATRIBUIDAS',
  canViewAllComprasScope:async()=>false,canViewPedidoCompraFinanceiro:async()=>false};
const controller=createController({User:{findByPk:async()=>({id:5})},auth,localizar:f.service});
const api=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',uiOrigin||'');res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,X-CSRF-Token,X-Audit-Session-Id');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  const u=new URL(req.url,'http://qa.local');
  const response={setHeader:(k,v)=>res.setHeader(k,v),status(n){res.statusCode=n;return this;},json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return this;}};
  if(req.method!=='GET')return response.status(405).json({error:'Escrita proibida no QA'});
  if(u.pathname==='/api/obras/minhas')return response.json([{id:1,nome:'Edificio Italia'}]);
  if(u.pathname==='/api/configuracoes/status-pedidos-compra')return response.json({statuses:[{codigo:'ABERTO',nome:'Aberto'},{codigo:'CANCELADO',nome:'Cancelado'}]});
  if(u.pathname==='/api/compras/relatorios/localizar-pedidos'){
    calls.push(Object.fromEntries(u.searchParams));
    if(req.headers.authorization!=='Bearer QA_LOCAL')return response.status(401).json({error:'Sem sessao QA'});
    const request={user:{id:5},query:Object.fromEntries(u.searchParams),compraScopeObraIds:[1]};
    if(u.searchParams.get('q')==='LENTO')await new Promise(resolve=>setTimeout(resolve,600));
    return controller(request,response);
  }
  errors.push('Rota QA inesperada: '+u.pathname);return response.status(404).json({error:'Rota QA nao prevista'});
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const apiOrigin=`http://127.0.0.1:${api.address().port}`;
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Page from'/src/pages/ComprasRelatorioLocalizarPedidos.jsx';import{ThemeContext}from'/src/contexts/ThemeContext.jsx';
import{setAuthToken,installFetchSecurityDefaults}from'/src/services/api.js';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/components/lista-avancada/lista-avancada.css';
import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';
import'/src/modules/solicitacao-compra/compras-responsive.css';import'/src/styles/responsive-system.css';
setAuthToken('QA_LOCAL');installFetchSecurityDefaults();
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:{}}}><Page/></ThemeContext.Provider></MemoryRouter>);`;
const virtual={'\0pedidos-entry.jsx':entry,'\0pedidos-auth.js':"export const useAuth=()=>({user:{id:5,perfil:'USUARIO'},authReady:false,isAuthenticated:true});"};
const vite=await createServer({root,configFile:false,envFile:false,logLevel:'error',
  define:{'import.meta.env.VITE_API_URL':JSON.stringify(apiOrigin+'/api')},
  css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},server:{host:'127.0.0.1',port:0},
  plugins:[{name:'qa-pedidos-local',enforce:'pre',resolveId(id){
    if(id==='/qa-pedidos.jsx')return'\0pedidos-entry.jsx';
    if(id.includes('contexts/AuthContext')||id==='./AuthContext')return'\0pedidos-auth.js';
  },load(id){if(Object.hasOwn(virtual,id))return id.endsWith('.jsx')?transformWithEsbuild(virtual[id],id,{loader:'jsx',jsx:'transform'}):virtual[id];},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/qa-pedidos')return next();res.setHeader('Content-Type','text/html');
    res.end(await server.transformIndexHtml('/qa-pedidos','<html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/qa-pedidos.jsx"></script></body></html>'));
  });}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
  // CSV protege formula, aspas, quebra de linha e conserva casas monetarias.
  const csv=csvPedidosLocalizados([{codigo:'PC-1',fornecedor:'=HYPERLINK("x")',itens:[{descricao:'Areia; "fina"\nlinha',quantidade_pedido:1,unidade:'m3'}],valor_total:'566.44'}]);
  assert(csv.startsWith('\ufeff'));assert(csv.includes('"\'=HYPERLINK(""x"")"'));assert(csv.includes('"566,44"'));assert(csv.includes('Areia; ""fina""\nlinha'));
  await vite.listen();uiOrigin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  await context.route('**/*',route=>{
    if([uiOrigin,apiOrigin].some(o=>route.request().url().startsWith(o+'/')))return route.continue();
    external.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(uiOrigin+'/qa-pedidos');
  const ready=()=>page.getByRole('button',{name:'Consultar',exact:true}).waitFor({state:'visible'});
  const total=async n=>{await page.getByText(new RegExp('^'+n+' pedido\\(s\\) no recorte')).waitFor();await ready();};
  await total(63);assert.equal(await page.getByRole('link',{name:/^PC-/}).count(),25);
  await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.getByText('Página 2 de 3', {exact:false}).waitFor();await ready();
  await page.getByLabel('Pedidos por página').selectOption('100');await total(63);assert.equal(await page.getByRole('link',{name:/^PC-/}).count(),63);
  const beforeTyping=calls.length;
  await page.getByLabel('Fornecedor',{exact:true}).fill('Pedreira');await page.getByLabel('Item do pedido',{exact:true}).fill('Cimento');
  await page.getByLabel('Código da solicitação',{exact:true}).fill('SOL-35');
  await page.getByText('Filtros editados.',{exact:false}).waitFor();assert.equal(calls.length,beforeTyping);
  await page.getByRole('button',{name:'Consultar',exact:true}).click();await total(1);
  assert.equal(await page.getByRole('link',{name:'PC-00026',exact:true}).getAttribute('href'),'/pedidos-compra/26');
  assert.equal(await page.getByRole('link',{name:'SOL-35',exact:true}).getAttribute('href'),'/solicitacoes/2153');
  assert((await page.locator('body').innerText()).includes('Cimento'));
  assert((await page.locator('body').innerText()).includes('24/10/2026, 17:00:00'));
  const out=path.join(root,'../outputs/localizar-pedidos-20261024');await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar esta página (CSV)',exact:true}).click();
  const file=await download,content=await fs.readFile(await file.path(),'utf8');assert(content.includes('PC-00026'));assert(!content.includes('PC-00027'));
  await page.getByLabel('Valor mínimo da aquisição',{exact:true}).fill('700,00');await page.getByRole('button',{name:'Consultar',exact:true}).click();await total(0);
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await total(63);
  await page.getByLabel('Busca geral',{exact:true}).fill('LENTO');await page.getByRole('button',{name:'Consultar',exact:true}).click();
  await page.getByRole('button',{name:'Consultando...',exact:true}).waitFor();await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await total(63);
  await page.waitForTimeout(700);await total(63); // resposta antiga nao substitui o recorte atual
  deny=true;await page.getByRole('button',{name:'Consultar',exact:true}).click();await ready();
  await page.getByText('Acesso negado a consulta de pedidos',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:/^PC-/}).count(),0);
  assert(await page.getByRole('button',{name:'Exportar esta página (CSV)',exact:true}).isDisabled());
  deny=false;await page.getByLabel('Número do pedido',{exact:true}).fill('PC-00026');await page.getByRole('button',{name:'Consultar',exact:true}).click();await total(1);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert(await page.getByRole('link',{name:'PC-00026',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Pagina transborda no celular');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert(f.queries.every(q=>/^SELECT/.test(q.query)));
  console.log('QA aprovado: consulta HTTP/controller/SQL local, filtros combinados, paginação, CSV, erro/permissão, resposta antiga e mobile. Sem rede externa ou escrita financeira.');
  await context.close();
}finally{await browser?.close();await vite.close();await new Promise(resolve=>api.close(resolve));f.close();}
