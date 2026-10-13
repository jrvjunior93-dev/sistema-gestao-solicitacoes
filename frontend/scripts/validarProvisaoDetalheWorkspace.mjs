// Detalhe real e APIs locais simuladas; sem banco, upload ou alteracao real.
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
import Detail from'/src/modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx';
window.reads=[];window.writes=[];window.denied=false;window.editable=true;window.failSave=false;
window.record={id:17,codigo:'PROV-QA-17',obra_id:7,obra:{id:7,nome:'Obra QA'},categoriaMacro:{id:1,nome:'Estrutura'},data_prevista_desembolso:'2026-12-31',valor_previsto:'150.00',descricao:'Descrição original QA',fornecedor_texto:'Credor QA',prioridade:'alta',status:'previsto',anexos:[],historicos:[]};
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'provisao-17',memory,snapshot:true,active:true}}>{active?<Detail/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Routes><Route path='/fixture/:id' element={<Host/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const wait=()=>new Promise(r=>setTimeout(r,180)),copy=v=>structuredClone(v);
export const getProvisionamentoFinanceiroContexto=async()=>{window.reads.push('contexto');const editable=window.editable;await wait();return {permissoes:{pode_editar:editable}}};
export const listarCategoriasMacroProvisionamento=async()=>[{id:1,nome:'Estrutura'}];
export const getProvisaoFinanceira=async()=>{window.reads.push('detail');const denied=window.denied,record=copy(window.record);await wait();if(denied)throw new Error('Provisão negada QA');return record};
export const atualizarProvisaoFinanceira=async(id,payload)=>{window.writes.push({kind:'update',id,payload:copy(payload)});await wait();if(window.failSave)throw new Error('Edição negada QA');window.record={...window.record,...payload,categoriaMacro:{id:1,nome:payload.item_macro}};return copy(window.record)};
export const adicionarComentarioProvisaoFinanceira=async(id,payload)=>{window.writes.push({kind:'comment',id,payload});await wait();window.record.historicos.push({id:1,acao:'COMENTARIO_ADICIONADO',comentario:payload.comentario});return copy(window.record)};
export const uploadAnexosProvisaoFinanceira=async(id,files)=>{window.writes.push({kind:'upload',id,names:files.map(f=>f.name)});await wait();window.record.anexos.push({id:1,nome_original:files[0].name});return copy(window.record.anexos)};
export const obterLinkAnexoProvisaoFinanceira=async()=>{throw new Error('Nao abrir link no teste de navegacao')};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-provisao-detalhe',enforce:'pre',
 resolveId(id){if(id==='/fixture.jsx')return '\0qa-provisao-detalhe.jsx'},
 async load(id){if(id==='\0qa-provisao-detalhe.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(_code,id){if(id.endsWith('/src/services/provisoesFinanceiras.js'))return mocks},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!/^\/fixture\/\d+$/.test(new URL(req.url,'http://localhost').pathname))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
 const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture/17';
 const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
 const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
 const input=name=>page.getByLabel(name,{exact:true});
 const editForm=()=>page.locator('form').filter({has:input('Descrição')});
 const commentForm=()=>page.locator('form').filter({has:input('Novo comentário')});
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)});
  await page.getByRole('button',{name:'Editar registro',exact:true}).click();await input('Descrição').fill('Última descrição Z');await input('Item macro').fill('Macro digitado');
  await input('Valor previsto').fill('25075');await input('Data prevista').fill('30/12/2026');await input('Prioridade').selectOption('media');await input('Credor').fill('Credor digitado');await input('Novo comentário').fill('Comentário incompleto Z');
  await alternate();await input('Descrição').waitFor();assert.equal(await input('Descrição').inputValue(),'Última descrição Z');assert.equal(await input('Novo comentário').inputValue(),'Comentário incompleto Z');assert.match(await input('Valor previsto').inputValue(),/250,75/);
  assert.equal(await page.evaluate(()=>window.writes.length),0);assert.equal(await page.evaluate(()=>window.reads.filter(x=>x==='detail').length),2);
  await input('Data prevista').fill('12/1');await alternate();await input('Data prevista').waitFor();assert.equal(await input('Data prevista').inputValue(),'12/1');
  await editForm().evaluate(f=>f.requestSubmit());assert.equal(await page.evaluate(()=>window.writes.length),0);await input('Data prevista').fill('30/12/2026');
  const fields=await page.evaluate(()=>Object.keys(window.qaMemory.get('provisao-17|'+encodeURIComponent('provisao:inputs')).fields).sort());assert.deepEqual(fields,['data_prevista_desembolso','descricao','fornecedor_texto','item_macro','prioridade','valor_previsto']);
  await commentForm().evaluate(el=>{el.requestSubmit();el.requestSubmit()});await page.getByText('Comentário registrado.',{exact:true}).waitFor();await input('Descrição').waitFor();
  assert.equal(await input('Descrição').inputValue(),'Última descrição Z');assert.equal(await input('Novo comentário').inputValue(),'');assert.equal(await page.evaluate(()=>window.writes.length),1);
  await page.locator('input[type=file]').setInputFiles({name:'qa-novo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 QA')});
  await page.getByText('1 anexo(s) enviado(s).',{exact:true}).waitFor();await input('Descrição').waitFor();assert.equal(await input('Descrição').inputValue(),'Última descrição Z');assert.equal(await page.evaluate(()=>window.writes.length),2);
  await alternate();await input('Descrição').waitFor();assert.equal(await page.evaluate(()=>window.writes.length),2);await page.getByText('qa-novo.pdf',{exact:true}).waitFor();
  await page.evaluate(()=>window.record.valor_previsto='170.00');await alternate();await page.getByRole('alert').filter({hasText:'A provisão mudou desde esta edição'}).waitFor();assert.ok(await page.getByRole('button',{name:'Salvar alteracoes',exact:true}).isDisabled());assert.equal(await input('Descrição').inputValue(),'Última descrição Z');
  await editForm().evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.writes.length),2);
  await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();assert.equal(await input('Descrição').inputValue(),'Descrição original QA');assert.match(await input('Valor previsto').inputValue(),/170,00/);
  await input('Descrição').fill('Salvar explicitamente Z');await page.evaluate(()=>window.failSave=true);await editForm().evaluate(el=>{el.requestSubmit();el.requestSubmit()});await page.getByText('Edição negada QA',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),3);
  await alternate();await input('Descrição').waitFor();assert.equal(await input('Descrição').inputValue(),'Salvar explicitamente Z');assert.equal(await page.evaluate(()=>window.writes.length),3);
  await page.evaluate(()=>window.failSave=false);await editForm().evaluate(el=>{el.requestSubmit();el.requestSubmit()});await page.getByText('Alterações da provisão salvas.',{exact:true}).waitFor();await page.getByRole('button',{name:'Editar registro',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.writes.length),4);assert.equal(await page.evaluate(()=>window.writes.at(-1).payload.descricao),'Salvar explicitamente Z');await alternate();await page.getByRole('button',{name:'Editar registro',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),4);
  assert.equal(await page.evaluate(()=>window.qaMemory.get('provisao-17|'+encodeURIComponent('provisao:inputs'))),null);
  await page.getByRole('button',{name:'Editar registro',exact:true}).click();await input('Descrição').fill('Não mostrar sem permissão');await input('Novo comentário').fill('Comentário protegido');
  await page.evaluate(()=>window.editable=false);await alternate();await page.getByRole('heading',{name:'PROV-QA-17',exact:true}).waitFor();assert.equal(await input('Descrição').count(),0);assert.equal(await input('Novo comentário').count(),0);assert.equal(await page.locator('input[type=file]').count(),0);
  await page.evaluate(()=>window.editable=true);await alternate();await input('Descrição').waitFor();assert.equal(await input('Descrição').inputValue(),'Não mostrar sem permissão');
  await page.evaluate(()=>window.record.status='realizado');await alternate();await page.getByRole('heading',{name:'PROV-QA-17',exact:true}).waitFor();assert.equal(await input('Descrição').count(),0);assert.equal(await page.getByRole('button',{name:'Editar registro',exact:true}).count(),0);
  await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Provisão negada QA',{exact:true}).first().waitFor();assert.equal(await page.getByText('qa-novo.pdf',{exact:true}).count(),0);assert.equal(await input('Novo comentário').count(),0);assert.equal(await page.getByRole('heading',{name:'PROV-QA-17',exact:true}).count(),0);
  const bounds=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(bounds.doc<=bounds.width+2);
  console.log('OK detalhe provisao '+width+'px: inputs/comentario, GET fresco, comentario/upload sem apagar edicao, conflito, mutex, sucesso sem replay e negativa/readonly.');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);console.error((await page?.locator('body').innerText())?.slice(0,4000));throw error}
finally{await browser?.close();await server.close()}
