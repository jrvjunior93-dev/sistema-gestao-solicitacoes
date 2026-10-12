// Lista real, transporte local isolado: nenhum banco ou negocio externo.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,WorkspaceContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import List from'/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx';
window.reads=[];window.opens=[];window.denied=false;window.contextDenied=false;window.slow=false;window.version='Inicial';
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspaceContext.Provider value={{canOpen:true,openTab:(route,title)=>{window.opens.push({route,title});A(false);return 'nova-aba'}}}><WorkspacePageContext.Provider value={{key:'lista-provisoes',memory,snapshot:true,active:true}}>{active?<List/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider></WorkspaceContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Host/></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const wait=()=>new Promise(r=>setTimeout(r,120));
export const getProvisionamentoFinanceiroContexto=async()=>{window.reads.push({kind:'contexto'});const denied=window.contextDenied;await wait();if(denied)throw new Error('Contexto negado QA');return {permissoes:{pode_criar:true},obras_acesso:[{id:7,nome:'Obra atual QA'}],criadores_filtro:[]}};
export const listarCategoriasMacroProvisionamento=async()=>[];
export const listarProvisoesFinanceiras=async params=>{window.reads.push({kind:'list',params:structuredClone(params)});const denied=window.denied,version=window.version;const data={items:[{id:17,codigo:'PROV-QA-17',descricao:version,valor_previsto:150,data_prevista_desembolso:'2026-12-31',status:'previsto',obra:{id:7,nome:'Obra atual QA'}}],meta:{page:params.page,limit:25,total:50,pages:2},resumo:{total_registros_filtrados:50,valor_total_filtrado:7500}};if(window.slow)await new Promise(r=>window.releaseSlow=()=>r());else await wait();if(denied)throw new Error('Lista negada QA');return data};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-provisoes-lista',enforce:'pre',
 resolveId(id){if(id==='/fixture.jsx')return '\0qa-provisoes-lista.jsx'},
 async load(id){if(id==='\0qa-provisoes-lista.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(_code,id){if(id.endsWith('/src/services/provisoesFinanceiras.js'))return mocks},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
 const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
 const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
 const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
 const search=()=>page.getByPlaceholder('Buscar código, descrição ou credor',{exact:true});
 const row=()=>page.getByText('PROV-QA-17',{exact:true});
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)});await row().waitFor();
  await search().fill('Última tecla Z');await page.waitForFunction(()=>window.reads.at(-1)?.params?.busca==='Última tecla Z');
  // Mobile nao oferece cabecalho tabular; teste a mesma ordenacao em desktop
  // antes de voltar ao viewport mobile para restaurar a pagina.
  await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'Valor previsto',exact:true}).click();
  await page.waitForFunction(()=>window.reads.at(-1)?.params?.sort_by==='valor_previsto');await row().waitFor();
  await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Próxima',exact:true}).click();
  await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 2 de 2',{exact:true}).waitFor();
  await page.evaluate(()=>window.version='Atual relido QA');await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.opens),[{route:'/provisoes-financeiras/17',title:'PROV-QA-17'}]);assert.match(page.url(),/\/fixture$/);
  await page.evaluate(()=>window.qaTab(true));await row().waitFor();await page.getByText('Atual relido QA',{exact:true}).waitFor();
  assert.equal(await search().inputValue(),'Última tecla Z');await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 2 de 2',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.reads.at(-1).params),{obra_id:'',categoria_macro_id:'',status:'',prioridade:'',busca:'Última tecla Z',fornecedor:'',usuario_criacao_id:'',data_inicial:'',data_final:'',sort_by:'valor_previsto',sort_dir:'DESC',page:2,limit:25});
  assert.equal(await page.getByText('Inicial',{exact:true}).count(),0);
  await page.getByLabel('Data inicial',{exact:true}).fill('12/1');await alternate();await row().waitFor();
  assert.equal(await page.getByLabel('Data inicial',{exact:true}).inputValue(),'12/1');
  assert.equal(await page.evaluate(()=>window.reads.at(-1).params.data_inicial),'');
  await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 2 de 2',{exact:true}).waitFor();
  await page.getByLabel('Data inicial',{exact:true}).fill('');
  await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Lista negada QA',{exact:true}).waitFor();assert.equal(await row().count(),0);
  await page.evaluate(()=>{window.denied=false;window.slow=true});await alternate();await page.waitForFunction(()=>Boolean(window.releaseSlow));
  await page.evaluate(()=>{window.slow=false;window.denied=true});await search().fill('Nova consulta negada');await page.getByText('Lista negada QA',{exact:true}).waitFor();
  await page.evaluate(()=>window.releaseSlow());await page.waitForTimeout(200);assert.equal(await row().count(),0);
  await page.evaluate(()=>{window.contextDenied=true;window.denied=false});await alternate();await page.getByText('Contexto negado QA',{exact:true}).first().waitFor();assert.equal(await row().count(),0);assert.equal(await search().count(),0);
  await page.evaluate(()=>window.contextDenied=false);await alternate();await row().waitFor();assert.equal(await search().inputValue(),'Nova consulta negada');
  assert.ok(await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 1 de 2',{exact:true}).isVisible());
  const stored=await page.evaluate(()=>Object.keys(window.qaMemory.get('lista-provisoes|'+encodeURIComponent('provisoes:filtros'))).sort());assert.deepEqual(stored,['busca','categoria_macro_id','data_final','data_inicial','fornecedor','obra_id','prioridade','status','usuario_criacao_id']);
  console.log('OK lista provisoes '+width+'px: filtros/ordenacao/pagina, nova aba, GET fresco, negativa e resposta tardia descartada.');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);console.error((await page?.locator('body').innerText())?.slice(0,4000));throw error}
finally{await browser?.close();await server.close()}
