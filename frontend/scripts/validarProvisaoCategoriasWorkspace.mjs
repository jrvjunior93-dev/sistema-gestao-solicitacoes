import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';import Cats from'/src/modules/provisionamento-financeiro/pages/GestaoCategoriasMacro.jsx';
window.rows=[{id:1,nome:'Categoria atual QA',descricao:'Original',ordem_exibicao:1,ativo:true}];window.writes=[];window.reads=0;window.finished=0;window.denied=false;window.readonly=false;
function Host(){const[a,A]=useState(true);const m=useMemo(()=>createWorkspaceMemory(),[]);window.tab=A;window.memory=m;return <WorkspacePageContext.Provider value={{key:'cats',memory:m,snapshot:true,active:true}}>{a?<Cats/>:<p>Auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Host/></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const wait=()=>new Promise(r=>setTimeout(r,130));
export const listarCategoriasMacroProvisionamento=async()=>{window.reads++;const denied=window.denied,rows=structuredClone(window.rows);await wait();window.finished++;if(denied)throw new Error('Categorias negadas QA');return rows};
export const criarCategoriaMacroProvisionamento=async data=>{window.writes.push({kind:'POST',data});await wait();window.rows.push({...data,id:2,ativo:true})};
export const atualizarCategoriaMacroProvisionamento=async(id,data)=>{window.writes.push({kind:'PUT',id,data});await wait();Object.assign(window.rows.find(r=>r.id===id),data)};
export const ativarCategoriaMacroProvisionamento=async id=>{window.writes.push({kind:'PATCH',id});await wait();window.rows.find(r=>r.id===id).ativo=true};
export const desativarCategoriaMacroProvisionamento=async id=>{window.writes.push({kind:'PATCH',id});await wait();window.rows.find(r=>r.id===id).ativo=false};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-cats',enforce:'pre',resolveId:id=>id==='/fixture.jsx'?'\0qa-cats.jsx':null,
load:async id=>id==='\0qa-cats.jsx'?transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'}):null,
transform(_code,id){if(id.endsWith('/services/provisoesFinanceiras.js'))return mocks;if(id.endsWith('/contexts/AuthContext.jsx'))return "export const useAuth=()=>({user:window.readonly?{id:1,perfil:'USUARIO',area:'OBRA',areas_permissoes_configuradas:true,areas_permissoes:[]}:{id:1,perfil:'SUPERADMIN',modulos_habilitados:[{key:'PROVISOES',enabled:true}]}})"},
configureServer(v){v.middlewares.use(async(req,res,next)=>{if(req.url!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml('/fixture','<html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
const alternate=async()=>{const n=await page.evaluate(()=>window.finished);await page.evaluate(()=>window.tab(false));await page.getByText('Auxiliar').waitFor();await page.evaluate(()=>window.tab(true));await page.waitForFunction(n=>window.finished>n,n);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
for(const width of [1366,390]){await page.setViewportSize({width,height:900});await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)});await page.getByText('Categoria atual QA',{exact:true}).waitFor();
const novo=page.getByLabel('Nome da nova categoria macro',{exact:true}),edit=page.getByLabel('Nome da categoria macro',{exact:true});
await novo.fill('Nova última Z');await page.getByLabel('Descrição da nova categoria macro').fill('Descrição digitada Z');await page.getByLabel('Ordem da nova categoria macro').fill('8');
const bounds=await page.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(bounds.doc<=bounds.w+2,'Formulario/categorias sem rolagem horizontal global');
await alternate();assert.equal(await novo.inputValue(),'Nova última Z');assert.equal(await page.getByLabel('Descrição da nova categoria macro').inputValue(),'Descrição digitada Z');assert.equal(await page.getByLabel('Ordem da nova categoria macro').inputValue(),'8');
await page.getByRole('button',{name:'Editar',exact:true}).first().click();await edit.fill('Edição final Z');await alternate();assert.equal(await edit.inputValue(),'Edição final Z');assert.equal(await page.evaluate(()=>window.writes.length),0);
await page.evaluate(()=>window.rows[0].nome='Atualizado por outro');await alternate();await page.getByRole('alert').filter({hasText:'A categoria mudou'}).waitFor();assert.ok(await edit.isDisabled());assert.ok(await page.getByRole('button',{name:'Salvar',exact:true}).isDisabled());
await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();assert.equal(await edit.inputValue(),'Atualizado por outro');await edit.fill('Salvo uma vez');await page.getByRole('button',{name:'Salvar',exact:true}).evaluate(b=>{b.click();b.click()});await page.getByText('Categoria macro "Salvo uma vez" atualizada.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.filter(w=>w.kind==='PUT').length),1);
assert.equal(await page.evaluate(()=>window.memory.get('cats|'+encodeURIComponent('provisoes:categoria:inputs'))),null,'Sucesso nao deixa rascunho vazio artificial');
await page.locator('form').evaluate(f=>{f.requestSubmit();f.requestSubmit()});await page.getByText('Categoria macro "Nova última Z" criada.',{exact:true}).waitFor();await novo.waitFor();assert.equal(await novo.inputValue(),'');assert.equal(await page.evaluate(()=>window.writes.filter(w=>w.kind==='POST').length),1);
await page.getByRole('button',{name:'Desativar',exact:true}).first().evaluate(b=>{b.click();b.click()});await page.getByRole('button',{name:'Ativar',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.filter(w=>w.kind==='PATCH').length),1);
await page.getByRole('button',{name:'Editar',exact:true}).first().click();await edit.fill('Ocultar edição');await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Categorias negadas QA',{exact:true}).first().waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(await edit.count(),0);assert.equal(await page.getByText('Salvo uma vez',{exact:true}).count(),0);
await page.evaluate(()=>window.denied=false);await alternate();assert.equal(await edit.inputValue(),'Ocultar edição');await page.evaluate(()=>window.rows=window.rows.filter(r=>r.id!==1));await alternate();await page.getByRole('alert').filter({hasText:'A categoria em edição não está disponível'}).waitFor();assert.equal(await edit.count(),0);assert.equal(await page.evaluate(()=>window.writes.length),3);
await page.evaluate(()=>{window.readonly=true;window.tab(false)});await page.getByText('Auxiliar').waitFor();await page.evaluate(()=>window.tab(true));await page.getByRole('alert').filter({hasText:'Gestão de categorias indisponível'}).waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);
console.log('OK categorias '+width+'px: novo/edicao, GET atual/conflito, negativas/alvo removido/permissao e mutex POST/PUT/PATCH sem replay.');}
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(e){console.error((await page?.locator('body').innerText())?.slice(0,3500));throw e}finally{await browser?.close();await server.close()}
