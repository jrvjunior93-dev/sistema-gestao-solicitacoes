// Pagina real de nova provisao, transporte local isolado. Sem banco ou upload real.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Nova from'/src/modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira.jsx';
window.reads=[];window.writes=[];window.uploads=[];window.denied=false;window.readonly=false;window.contextAllowed=true;window.failCreate=false;window.failUpload=false;
window.obras=[{id:7,codigo:'07',nome:'Obra QA'}];
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'provisao-nova',memory,snapshot:true,active:true}}>{active?<Nova/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Routes>
<Route path='/provisoes-financeiras/nova' element={<Host/>}/><Route path='/provisoes-financeiras/:id' element={<p>Provisão criada QA</p>}/><Route path='/provisoes-financeiras' element={<p>Lista de provisões QA</p>}/>
</Routes></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const wait=()=>new Promise(r=>setTimeout(r,160));
export const getProvisionamentoFinanceiroContexto=async()=>{window.reads.push('contexto');const denied=window.denied,allowed=window.contextAllowed,obras=structuredClone(window.obras);await wait();if(denied)throw new Error('Contexto negado QA');return {permissoes:{pode_criar:allowed},obras_criacao:obras}};
export const listarCategoriasMacroProvisionamento=async()=>{window.reads.push('categorias');await wait();return [{id:1,nome:'Estrutura'}]};
export const criarProvisaoFinanceira=async payload=>{window.writes.push(structuredClone(payload));await wait();if(window.failCreate)throw new Error('Criação negada QA');return {id:8}};
export const uploadAnexosProvisaoFinanceira=async(id,files)=>{window.uploads.push({id,names:files.map(f=>f.name),sizes:files.map(f=>f.size)});await wait();if(window.failUpload)throw new Error('Upload negado QA');return []};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-provisao-nova',enforce:'pre',
 resolveId(id){if(id==='/fixture.jsx')return '\0qa-provisao-nova.jsx'},
 async load(id){if(id==='\0qa-provisao-nova.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(_code,id){if(id.endsWith('/src/services/provisoesFinanceiras.js'))return mocks;
  if(id.endsWith('/src/contexts/AuthContext.jsx'))return "export const useAuth=()=>({user:window.readonly?{id:1,perfil:'USUARIO',area:'OBRA',modulos_habilitados:[{key:'PROVISOES',enabled:true}],areas_permissoes_configuradas:true,areas_permissoes:['provisoes.lista.visualizar']}:{id:1,perfil:'SUPERADMIN',area:'GEO',modulos_habilitados:[{key:'PROVISOES',enabled:true}]}});";
 },
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!new URL(req.url,'http://localhost').pathname.startsWith('/provisoes-financeiras'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
 const base='http://127.0.0.1:'+server.httpServer.address().port+'/provisoes-financeiras/nova';
 const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
 const goto=async()=>{await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)})};
 const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
 const input=name=>page.getByLabel(name.replace(/ \*$/,''),{exact:true});
 const fill=async()=>{await input('Obra *').selectOption('7');await input('Data prevista de desembolso *').fill('31/12/2026');await input('Item macro *').fill('Estrutura digitada');await input('Prioridade').selectOption('alta');await input('Valor previsto *').fill('12345');await input('Credor').fill('Credor final Z');await input('Descrição *').fill('Descrição última tecla!')};
 const attach=async()=>{await page.locator('input[type=file]').setInputFiles({name:'qa-provisao.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA local')});await page.getByText('qa-provisao.pdf',{exact:true}).waitFor()};
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});await goto();await fill();await attach();
  await alternate();await input('Obra *').waitFor();
  await input('Data prevista de desembolso *').fill('12/1');await alternate();await input('Obra *').waitFor();
  assert.equal(await input('Data prevista de desembolso *').inputValue(),'12/1');
  await page.locator('form').evaluate(f=>f.requestSubmit());assert.equal(await page.evaluate(()=>window.writes.length),0);
  await input('Data prevista de desembolso *').fill('31/12/2026');
  assert.equal(await input('Obra *').inputValue(),'7');assert.equal(await input('Descrição *').inputValue(),'Descrição última tecla!');assert.equal(await input('Credor').inputValue(),'Credor final Z');
  assert.equal(await input('Item macro *').inputValue(),'Estrutura digitada');assert.equal(await input('Prioridade').inputValue(),'alta');assert.match(await input('Valor previsto *').inputValue(),/123,45/);await page.getByText('qa-provisao.pdf',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.reads.filter(r=>r==='contexto').length),3);assert.equal(await page.evaluate(()=>window.writes.length+window.uploads.length),0);
  const fields=await page.evaluate(()=>Object.keys(window.qaMemory.get('provisao-nova|'+encodeURIComponent('provisao:nova:inputs'))).sort());assert.deepEqual(fields,['data_prevista_desembolso','descricao','fornecedor_texto','item_macro','obra_id','prioridade','valor_previsto']);
  await page.evaluate(()=>window.obras=[]);await alternate();await page.getByRole('alert').filter({hasText:'A obra selecionada não está disponível'}).waitFor();
  assert.equal(await input('Descrição *').inputValue(),'Descrição última tecla!');assert.ok(await page.getByRole('button',{name:'Criar provisao',exact:true}).isDisabled());
  await page.locator('form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.writes.length),0);
  await page.evaluate(()=>window.obras=[{id:7,codigo:'07',nome:'Obra atual QA'}]);await alternate();await input('Obra *').getByRole('option',{name:'07 - Obra atual QA',exact:true}).waitFor({state:'attached'});assert.equal(await input('Obra *').inputValue(),'7');
  await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Contexto negado QA',{exact:true}).waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(await page.getByText('qa-provisao.pdf',{exact:true}).count(),0);
  await page.evaluate(()=>window.denied=false);await alternate();await input('Obra *').waitFor();assert.equal(await input('Descrição *').inputValue(),'Descrição última tecla!');
  await page.evaluate(()=>window.contextAllowed=false);await alternate();await page.getByText('Criação de provisão indisponível para este usuário.',{exact:true}).waitFor();assert.equal(await input('Descrição *').count(),0);
  await page.evaluate(()=>window.contextAllowed=true);await alternate();await input('Obra *').waitFor();await page.evaluate(()=>window.failCreate=true);
  await page.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});await page.getByText('Criação negada QA',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);assert.equal(await page.evaluate(()=>window.uploads.length),0);
  await alternate();await input('Obra *').waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);await page.getByText('qa-provisao.pdf',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failCreate=false;window.failUpload=true});await page.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});await page.getByText('Provisão criada QA',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.writes.length),2);assert.deepEqual(await page.evaluate(()=>window.uploads),[{id:8,names:['qa-provisao.pdf'],sizes:[Buffer.byteLength('%PDF-1.4\nQA local')]}]);
  assert.equal(await page.evaluate(()=>window.writes.at(-1).valor_previsto),'123.45');
  await page.goBack();await input('Obra *').waitFor();assert.equal(await input('Descrição *').inputValue(),'');assert.equal(await page.getByText('qa-provisao.pdf',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.writes.length),2);
  await fill();await page.evaluate(()=>window.readonly=true);await alternate();await page.getByText('Criação de provisão indisponível para este usuário.',{exact:true}).waitFor();assert.equal(await input('Descrição *').count(),0);
  const bounds=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(bounds.doc<=bounds.width+2);
  console.log('OK nova provisao '+width+'px: campos/Files, ultima tecla, contexto/obra atuais, negativa/permissao, mutex e criacao/upload sem replay.');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);console.error((await page?.locator('body').innerText())?.slice(0,4000));throw error}
finally{await browser?.close();await server.close()}
