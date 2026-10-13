// Dashboard/relatorio reais, consultas simuladas e memoria de sessao.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspaceContext,WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Dashboard from'/src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx';import Report from'/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx';
window.reads=[];window.finished=0;window.denied=false;window.baseDenied=false;window.allowed=true;window.obras=[{id:7,codigo:'07',nome:'Obra atual QA'}];window.delay=100;window.opened=[];
function Host(){const[a,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.tab=A;window.memory=memory;
return <WorkspaceContext.Provider value={{canOpen:true,openTab:(route,title)=>{window.opened.push({route,title});A(false);return true}}}><WorkspacePageContext.Provider value={{key:location.pathname,memory,snapshot:true,active:true}}>{a?(location.pathname.includes('operacional')?<Report/>:<Dashboard/>):<p>Auxiliar</p>}</WorkspacePageContext.Provider></WorkspaceContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Routes><Route path='/provisoes-financeiras/*' element={<Host/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const wait=ms=>new Promise(r=>setTimeout(r,ms));
const row=p=>({id:17,codigo:'PROV-QA-'+(p.prioridade||'todos'),obra:{id:7,codigo:'07',nome:'Obra atual QA'},data_prevista_desembolso:'2026-12-31',valor_previsto:123,descricao:'Recorte '+(p.prioridade||'todos'),status:'previsto',prioridade:p.prioridade||'baixa'});
export const getProvisionamentoFinanceiroContexto=async()=>{window.reads.push({kind:'contexto'});const denied=window.baseDenied,allowed=window.allowed,obras=structuredClone(window.obras);await wait(80);window.finished++;if(denied)throw new Error('Contexto negado QA');return {permissoes:{pode_dashboard:allowed},obras_acesso:obras}};
export const listarCategoriasMacroProvisionamento=async()=>{await wait(80);return [{id:1,nome:'Estrutura QA'}]};
export const getDashboardProvisionamentoFinanceiro=async p=>{window.reads.push({kind:'dashboard',params:structuredClone(p)});const denied=window.denied,delay=window.delay;await wait(delay);window.finished++;if(denied)throw new Error('Recorte negado QA');return {cards:{total_periodo:123,quantidade_abertas:1},alertas:{vencidas_nao_tratadas:{quantidade:1,itens:[row(p)]},itens_criticos_proximos:{itens:[]},obras_concentracao_alta:[]},graficos:{por_mes:[{mes:'2026-12',total_valor:123}],por_obra:[],por_categoria:[],curva_semanal:[],pipeline_status:[]}}};
export const listarProvisoesFinanceiras=async p=>{window.reads.push({kind:'lista',params:structuredClone(p)});const denied=window.denied,delay=window.delay;await wait(delay);window.finished++;if(denied)throw new Error('Recorte negado QA');return {items:[row(p)]}};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-provisao-consultas',enforce:'pre',resolveId:id=>id==='/fixture.jsx'?'\0qa-provisao-consultas.jsx':null,
load:async id=>id==='\0qa-provisao-consultas.jsx'?transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'}):null,
transform(_code,id){if(id.endsWith('/services/provisoesFinanceiras.js'))return mocks},
configureServer(v){v.middlewares.use(async(req,res,next)=>{if(!new URL(req.url,'http://localhost').pathname.startsWith('/provisoes-financeiras'))return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml('/fixture','<html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
const base='http://127.0.0.1:'+server.httpServer.address().port;const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
const off=async()=>{await page.evaluate(()=>window.tab(false));await page.getByText('Auxiliar').waitFor()};const on=async()=>{await page.evaluate(()=>window.tab(true));await page.getByLabel('Data inicial',{exact:true}).waitFor()};
const ready=async()=>{await page.getByText(/^PROV-QA-/,{exact:true}).first().waitFor();await page.getByRole('button',{name:/^Atualizar(?: relatorio)?$/,exact:true}).waitFor()};
const choose=async value=>{await page.getByRole('button',{name:/^Prioridade/}).click();await page.getByRole('radio',{name:value,exact:true}).check();await page.getByRole('button',{name:/^Prioridade/}).click()};
for(const width of [1366,390])for(const report of [false,true]){await page.setViewportSize({width,height:900});const url=base+'/provisoes-financeiras/'+(report?'relatorios/operacional':'dashboard');await page.goto(url);await page.addStyleTag({path:path.join(root,'dist/assets',css)});await ready();
const initial=page.getByLabel('Data inicial',{exact:true}),final=page.getByLabel('Data final',{exact:true});const update=page.getByRole('button',{name:report?'Atualizar relatorio':'Atualizar',exact:true});
await initial.fill('12/1');await final.fill('31/12/2026');if(!report)await ready();await choose('Alta');
if(!report)await page.getByText('PROV-QA-alta',{exact:true}).waitFor();
const count=await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').length);await off();await on();await ready();
assert.equal(await initial.inputValue(),'12/1');assert.equal(await final.inputValue(),'31/12/2026');assert.equal(await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').length),count+1);
const last=await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').at(-1).params);assert.equal(last.prioridade,report?'':'alta');assert.equal(last.data_final,report?'':'2026-12-31');
const before=await page.evaluate(()=>window.reads.length);await update.click();await page.evaluate(()=>new Promise(r=>setTimeout(r,120)));assert.equal(await page.evaluate(()=>window.reads.length),before);
await initial.fill('01/01/2026');if(report){await update.evaluate(b=>{b.click();b.click()});await page.getByText('PROV-QA-alta',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').length),count+2)}else await ready();
await page.getByText('PROV-QA-alta',{exact:true}).first().waitFor();const params=await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').at(-1).params);assert.equal(params.data_inicial,'2026-01-01');assert.equal(params.prioridade,'alta');
if(report){const listed=await page.evaluate(()=>window.reads.filter(r=>r.kind==='lista').at(-1).params);assert.equal(listed.limit,200);assert.equal(listed.page,1);assert.equal(listed.sort_by,'data_prevista_desembolso');await choose('Critica');const n=await page.evaluate(()=>window.reads.length);await off();await on();await ready();assert.equal(await page.evaluate(()=>window.reads.filter(r=>r.kind==='dashboard').at(-1).params.prioridade),'alta');assert.equal(await page.evaluate(()=>window.reads.length),n+3)}
if(report)await page.getByRole('link',{name:'PROV-QA-alta',exact:true}).click();else await page.getByRole('button',{name:'Detalhes',exact:true}).first().click();await page.getByText('Auxiliar').waitFor();assert.deepEqual(await page.evaluate(()=>window.opened.at(-1)),{route:'/provisoes-financeiras/17',title:'PROV-QA-alta'});assert.equal(page.url(),url);await on();await ready();
await page.evaluate(()=>window.baseDenied=true);await off();await page.evaluate(()=>window.tab(true));await page.getByText('Contexto negado QA',{exact:true}).first().waitFor();assert.equal(await initial.count(),0);assert.equal(await page.getByText(/^PROV-QA-/,{exact:true}).count(),0);
await page.evaluate(()=>{window.baseDenied=false;window.denied=true});await off();await on();await page.getByText('Recorte negado QA',{exact:true}).first().waitFor();assert.equal(await page.getByText(/^PROV-QA-/,{exact:true}).count(),0);
// Uma resposta 200 lenta de uma montagem anterior nao pode vencer a negativa atual.
await page.evaluate(()=>{window.denied=false;window.delay=450});await off();await on();await page.evaluate(()=>{window.denied=true;window.delay=60});await off();await on();await page.getByText('Recorte negado QA',{exact:true}).first().waitFor();await page.evaluate(()=>new Promise(r=>setTimeout(r,500)));assert.equal(await page.getByText(/^PROV-QA-/,{exact:true}).count(),0);
await page.evaluate(()=>{window.denied=false;window.delay=80});await off();await on();await ready();await initial.fill('12');await page.getByRole('button',{name:report?'Limpar':'Limpar filtros',exact:true}).click();assert.equal(await initial.inputValue(),'');await off();await on();await ready();assert.equal(await initial.inputValue(),'');
await page.evaluate(()=>window.allowed=false);await off();await page.evaluate(()=>window.tab(true));await page.getByText(report?'Relatório indisponível para este usuário.':'Redirecionando...',{exact:true}).waitFor();assert.equal(await page.getByText(/^PROV-QA-/,{exact:true}).count(),0);
const bounds=await page.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(bounds.doc<=bounds.w+2);console.log('OK '+(report?'relatorio':'dashboard')+' '+width+'px: filtros/data parcial, consulta aplicada, detalhe independente, atualizacao/negativas/permissao, resposta tardia e limpeza.');}
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(e){console.error((await page?.locator('body').innerText())?.slice(0,4000));throw e}finally{await browser?.close();await server.close()}
