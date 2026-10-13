// Tela/modal reais; transporte isolado em memoria, sem banco ou upload externo.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'../outputs/fila-comprovantes-workspace');mkdirSync(output,{recursive:true});
const names=[...readFileSync(path.join(root,'src/services/financeiro.js'),'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m=>m[1]);
const methods={
  getFilaPagamentos:`async()=>{await wait();window.reads++;if(window.denied)throw new Error('Fila negada QA');return {data:structuredClone(window.rows),resumo:{}}}`,
  getContasFilaPagamentos:`async()=>[]`,
  getInstrumentosFilaPagamentos:`async()=>({formas:[{id:4,nome:'Cheque',tipo:'CHEQUE'}],cartoes:[],cheques:[]})`,
  previewComprovantesFilaPagamentos:`async files=>{window.previews.push(files.map(f=>f.name));await wait();if(window.previewDenied)throw new Error('Leitura negada QA');return {arquivos:files.map(file=>({arquivo_nome:file.name,arquivo_hash:'hash-'+file.name,dados:{valor:100,banco:'CAIXA',texto_reconhecido:true,favorecido_nome:'Leitura atual QA'},duplicado:window.linked.includes(file.name)?{fila_id:2,titulo_codigo:'TIT-2'}:null,fila_sugerida_id:1,candidatos:[]})),titulos_pendentes:window.options}}`,
  vincularComprovantesFilaPagamentos:`async(files,mappings)=>{window.links.push({files:files.map(f=>f.name),mappings});await wait();if(window.failSecond&&window.links.length===2)throw new Error('Falha no segundo lote QA');window.linked.push(...files.map(f=>f.name));return {quantidade:files.length}}`
};
const mocks=`const wait=()=>new Promise(r=>setTimeout(r,120));`+names.map(n=>`export const ${n}=${methods[n]||'async()=>[]'};`).join('\n');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Page from'/src/pages/FinanceiroFilaPagamentos.jsx';
window.reads=0;window.rows=[];window.previews=[];window.links=[];window.linked=[];window.denied=false;window.previewDenied=false;window.permission=true;window.failSecond=false;
window.options=[{fila_id:1,titulo_id:1,titulo_codigo:'TIT-1',valor_saldo:100,favorecido:'Atual 1'},{fila_id:2,titulo_id:2,titulo_codigo:'TIT-2',valor_saldo:100,favorecido:'Atual 2'}];
function App(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'fila-qa',memory,snapshot:true,active:true}}>{active?<Page/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><App/></main></ThemeContext.Provider></BrowserRouter>);`;
const server=await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(output,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{name:'fila-pdf-qa',enforce:'pre',
  resolveId(id){if(id==='/fixture.jsx')return '\0qa-fila-pdf.jsx'},
  async load(id){if(id==='\0qa-fila-pdf.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
  transform(_code,id){if(id.endsWith('/src/services/financeiro.js'))return mocks;
    if(id.endsWith('/src/contexts/AuthContext.jsx'))return "const user={id:1,perfil:'SUPERADMIN',area:'FINANCEIRO'};export const useAuth=()=>({user});";
    if(id.endsWith('/src/utils/acessoProduto.js'))return "export const canBaixarFilaPagamentos=()=>true,hasPermissao=()=>true,canImportarComprovantesFilaPagamentos=()=>window.permission,canReportarFilaPagamentos=()=>true,canResolverFilaPagamentos=()=>true;";
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();
  page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async()=>{await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)});await page.waitForFunction(()=>window.reads>0)};
  const leave=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor()};
  const back=async()=>{const reads=await page.evaluate(()=>window.reads);await page.evaluate(()=>window.qaTab(true));await page.waitForFunction(n=>window.reads>n,reads)};
  const modal=page.getByRole('dialog',{name:'Importar comprovantes PDF',exact:true});
  const payloads=count=>Array.from({length:count},(_,i)=>({name:`comprovante-${i+1}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-QA-'+i)}));
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto();await page.getByRole('button',{name:'Importar comprovantes',exact:true}).click();
    await modal.getByLabel('Comprovantes PDF',{exact:true}).setInputFiles(payloads(1));
    await leave();await back();await modal.waitFor();await modal.getByText('comprovante-1.pdf',{exact:true}).waitFor();
    assert.ok(await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).isDisabled());
    assert.equal(await page.evaluate(()=>window.previews.length),0);
    await modal.getByRole('button',{name:'Ler comprovantes',exact:true}).evaluate(el=>{el.click();el.click()});
    const select=modal.getByLabel('Título para comprovante-1.pdf',{exact:true});await select.waitFor();
    assert.equal(await page.evaluate(()=>window.previews.length),1);await select.selectOption('2');
    await leave();await back();await modal.waitFor();
    assert.equal(await select.count(),0);assert.equal(await page.evaluate(()=>window.previews.length),1);
    const saved=await page.evaluate(()=>({files:window.qaMemory.get('fila-qa|fila%3ApdfFiles').map(f=>({name:f.name,isFile:f instanceof File})),links:window.qaMemory.get('fila-qa|fila%3ApdfLinks')}));
    assert.deepEqual(saved,{files:[{name:'comprovante-1.pdf',isFile:true}],links:{'hash-comprovante-1.pdf':'2'}});
    await modal.getByRole('button',{name:'Revalidar comprovantes',exact:true}).click();await select.waitFor();assert.equal(await select.inputValue(),'2');
    assert.equal(await page.evaluate(()=>window.links.length),0);
    await leave();await page.evaluate(()=>window.options=window.options.filter(t=>t.fila_id!==2));await back();
    await modal.getByRole('button',{name:'Revalidar comprovantes',exact:true}).click();await select.waitFor();
    assert.equal(await select.inputValue(),'');await modal.getByRole('alert').waitFor();
    assert.ok(await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).isDisabled());
    await leave();await page.evaluate(()=>window.previewDenied=true);await back();
    await modal.getByRole('button',{name:'Revalidar comprovantes',exact:true}).click();await modal.getByText('Leitura negada QA',{exact:true}).waitFor();
    assert.equal(await select.count(),0);assert.ok(await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).isDisabled());
    await leave();await page.evaluate(()=>window.denied=true);await back();assert.equal(await modal.count(),0);
    await page.getByText('Fila negada QA',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.links.length),0);

    await goto();await page.getByRole('button',{name:'Importar comprovantes',exact:true}).click();
    await modal.getByLabel('Comprovantes PDF',{exact:true}).setInputFiles(payloads(1));await modal.getByRole('button',{name:'Ler comprovantes',exact:true}).click();await select.waitFor();
    await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).evaluate(el=>{el.click();el.click()});await modal.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.links.length),1);await leave();await back();assert.equal(await modal.count(),0);
    assert.equal(await page.evaluate(()=>window.links.length),1);

    await goto();await page.getByRole('button',{name:'Importar comprovantes',exact:true}).click();
    await modal.getByLabel('Comprovantes PDF',{exact:true}).setInputFiles(payloads(11));await modal.getByRole('button',{name:'Ler comprovantes',exact:true}).click();
    await modal.getByLabel('Título para comprovante-11.pdf',{exact:true}).waitFor();await page.evaluate(()=>window.failSecond=true);
    await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).click();await modal.getByText(/10 comprovante\(s\) foram vinculados antes da falha/).waitFor();
    assert.ok(await modal.getByRole('button',{name:'Vincular comprovantes',exact:true}).isDisabled());
    await leave();await back();await modal.waitFor();
    assert.deepEqual(await page.evaluate(()=>window.qaMemory.get('fila-qa|fila%3ApdfFiles').map(f=>f.name)),['comprovante-11.pdf']);
    assert.equal(await page.evaluate(()=>window.links.length),2);
    await modal.getByRole('button',{name:'Ler comprovantes',exact:true}).click();await modal.getByLabel('Título para comprovante-11.pdf',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.previews.at(-1)),['comprovante-11.pdf']);
    await modal.getByRole('button',{name:'Cancelar',exact:true}).click();await modal.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.qaMemory.get('fila-qa|fila%3ApdfFiles').length),0);
    console.log('OK comprovantes '+width+'px: Files/IDs em memoria, leitura explicita atual, negativa, mutex, falha parcial sem replay.');

    await goto();await leave();await page.evaluate(()=>window.rows=[{id:1,status:'PENDENTE',juros:0,multa:0,titulo:{id:1,codigo:'TIT-CHEQUE-QA',status:'ABERTO',valor_saldo:100,forma_pagamento_id:4}}]);await back();
    await page.getByRole('button',{name:'Dados do cheque próprio de TIT-CHEQUE-QA',exact:true}).click();
    const cheque=page.getByRole('dialog',{name:'Dados do cheque próprio de TIT-CHEQUE-QA',exact:true});
    const number=cheque.getByLabel('Numero do cheque *',{exact:true});await number.fill('123-ULTIMA-TECLA');
    await cheque.getByLabel('Emitente / titular *',{exact:true}).fill('Emitente digitado QA');
    await leave();await back();await cheque.waitFor();assert.equal(await number.inputValue(),'123-ULTIMA-TECLA');
    assert.equal(await page.evaluate(()=>window.links.length),0);
    await leave();await page.evaluate(()=>window.rows[0].titulo.valor_saldo=90);await back();await cheque.getByRole('alert').waitFor();
    assert.equal(await number.inputValue(),'123-ULTIMA-TECLA');assert.ok(await cheque.getByRole('button',{name:'Confirmar dados do cheque',exact:true}).isDisabled());
    await cheque.getByRole('button',{name:'Descartar edição do cheque',exact:true}).click();assert.equal(await number.inputValue(),'');
    await number.fill('999');await cheque.getByLabel('Emitente / titular *',{exact:true}).fill('Cheque revalidado QA');
    await cheque.getByRole('button',{name:'Confirmar dados do cheque',exact:true}).click();await cheque.waitFor({state:'hidden'});
    await leave();await back();await page.getByRole('button',{name:'Dados do cheque próprio de TIT-CHEQUE-QA',exact:true}).click();
    await cheque.waitFor();assert.equal(await number.inputValue(),'999');await number.fill('NAO CONFIRMADO');
    await cheque.getByRole('button',{name:'Cancelar',exact:true}).first().click();
    await page.getByRole('button',{name:'Dados do cheque próprio de TIT-CHEQUE-QA',exact:true}).click();assert.equal(await number.inputValue(),'999');
    await leave();await page.evaluate(()=>{window.rows[0].status='BAIXADO';window.rows[0].titulo.status='QUITADO';window.rows[0].movimento_financeiro_id=10});await back();
    assert.equal(await cheque.count(),0);assert.equal(await page.getByRole('button',{name:'Registrar baixa',exact:true}).count(),0);
    console.log('OK cheque '+width+'px: editor incompleto preservado, conflito atual, descarte, cancelar e status bloqueado.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);if(page){await page.screenshot({path:path.join(output,'falha.png')});console.error((await page.locator('body').innerText()).slice(0,5000))}throw error}
finally{await browser?.close();await server.close()}
