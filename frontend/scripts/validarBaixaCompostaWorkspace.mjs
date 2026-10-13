// Componente real, transporte local isolado; nunca conecta ao banco/API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = `import React,{useEffect,useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Modal from'/src/components/financeiro/BaixaCompostaModal.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
window.reads=0;window.previews=[];window.writes=[];window.denied=false;window.readonly=false;window.fail=true;
window.data={titulos:[{id:1,codigo:'TIT-A',tipo:'PAGAR',status:'ABERTO',valor_saldo:100,empresa_id:8,parceiro_id:7,data_vencimento:'2026-10-01'},
{id:2,codigo:'TIT-B',tipo:'PAGAR',status:'ABERTO',valor_saldo:200,empresa_id:8,parceiro_id:7,data_vencimento:'2026-10-02'}],
formas:[{id:1,nome:'Pix',codigo:'PIX',ativo:true},{id:2,nome:'Cheque',codigo:'CHEQUE',ativo:true},{id:3,nome:'Dinheiro',codigo:'DINHEIRO',ativo:true}],
contas:[{id:9,nome:'Conta QA',empresa_id:8,ativo:true},{id:10,nome:'Caixa QA',empresa_id:8,ativo:true,tipo_operacional:'CAIXA_INTERNO'}],
cartoes:[],cheques:[{id:41,codigo:'CH-QA',numero_cheque:'1234',valor:50,empresa_id:8,status:'EM_CARTEIRA'}]};
function Page(){const[data,D]=useState(null);const[closed,C]=useState(false);useEffect(()=>{let live=true;setTimeout(()=>{window.reads++;if(live)D(window.denied?null:structuredClone(window.data))},100);return()=>{live=false}},[]);
return data&&!window.readonly&&!closed?<Modal {...data} eligible={data.titulos.every(t=>t.status==='ABERTO'&&Number(t.valor_saldo)>0)} onClose={()=>C(true)} onConfirmed={r=>window.result=r}/>:<p>{closed?'Baixa encerrada':data?'Somente consulta':'Baixa indisponível'}</p>}
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.memory=memory;
return <WorkspacePageContext.Provider value={{key:'fontes-qa',memory,snapshot:true,active:true}}>{active?<Page/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Host/></ThemeContext.Provider></MemoryRouter>);`;
const mocks = `export async function previewBaixaFinanceiraComposta(data){window.previews.push(structuredClone(data));await new Promise(r=>setTimeout(r,100));return {componentes:data.componentes,titulos:[1,2],valor_principal:200}}
export async function confirmarBaixaFinanceiraComposta(data,key){window.writes.push({data:structuredClone(data),key});await new Promise(r=>setTimeout(r,100));if(window.fail)throw new Error('Falha simulada de rede');return {id:90}}`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{
  name:'qa-fontes-local',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return '\0qa-fontes.jsx'},
  async load(id){if(id==='\0qa-fontes.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
  transform(_code,id){if(id.endsWith('/services/financeiro.js'))return mocks},
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();
    res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  })}
},react()]});
let browser,page;const errors=[],external=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async()=>{await page.goto(base);await page.addStyleTag({path:path.join(root,'dist/assets',css)});await page.getByRole('dialog').waitFor()};
  const alternate=async()=>{const count=await page.evaluate(()=>window.reads);await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true));await page.waitForFunction(count=>window.reads>count,count);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto();
    const obs=page.getByLabel('Observações do grupo',{exact:true}), amount=page.getByLabel('Valor da fonte *',{exact:true});
    const account=page.getByLabel('Conta financeira *',{exact:true});const review=page.getByRole('button',{name:'Validar e revisar',exact:true});
    await obs.fill('Observações com última tecla Z');await amount.fill('150');await account.selectOption('9');
    assert.equal(await page.getByLabel('Valor de TIT-A na fonte 1',{exact:true}).inputValue(),'100');assert.equal(await page.getByLabel('Valor de TIT-B na fonte 1',{exact:true}).inputValue(),'50');
    await alternate();assert.equal(await obs.inputValue(),'Observações com última tecla Z');assert.equal(await amount.inputValue(),'150');assert.equal(await account.inputValue(),'9');
    assert.equal(await page.evaluate(()=>window.previews.length),0);assert.equal(await page.evaluate(()=>window.writes.length),0);
    await review.evaluate(el=>{el.click();el.click()});await page.getByText('Validação concluída.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.previews.length),1);
    await alternate();assert.equal(await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.previews.length),1);
    await page.getByRole('button',{name:'Adicionar fonte',exact:true}).click();await page.getByLabel('Forma de pagamento *',{exact:true}).nth(1).selectOption('2');
    await page.getByLabel('Cheque de terceiro em carteira',{exact:true}).selectOption('41');assert.equal(await amount.nth(1).inputValue(),'50');
    await alternate();assert.equal(await amount.nth(1).inputValue(),'50');assert.equal(await page.getByLabel('Cheque de terceiro em carteira',{exact:true}).inputValue(),'41');
    const draft=await page.evaluate(()=>window.memory.get('fontes-qa|'+encodeURIComponent('baixaComposta:1:2')));
    assert.equal(Object.hasOwn(draft.fields.components[1],'empresa_id'),false);assert.equal(draft.fields.components[1].valor,'');assert.equal(Object.hasOwn(draft,'preview'),false);
    await page.evaluate(()=>window.data.cheques[0].valor=60);await alternate();assert.equal(await amount.nth(1).inputValue(),'60');
    await page.getByRole('alert').filter({hasText:'Os saldos ou instrumentos mudaram'}).waitFor();assert.ok(await review.isDisabled());assert.equal(await obs.inputValue(),'Observações com última tecla Z');
    await page.getByRole('button',{name:'Descartar baixa digitada',exact:true}).click();assert.equal(await obs.inputValue(),'');assert.equal(await amount.count(),1);
    await amount.fill('100');await account.selectOption('9');await page.evaluate(()=>window.data.titulos[0].valor_saldo=95);await alternate();assert.ok(await review.isDisabled());
    await page.getByRole('button',{name:'Descartar baixa digitada',exact:true}).click();await amount.fill('95');await account.selectOption('9');
    await review.click();await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).evaluate(el=>{el.click();el.click()});await page.getByText('Falha simulada de rede',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.writes.length),1);await page.evaluate(()=>window.fail=false);
    await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).evaluate(el=>{el.click();el.click()});await page.getByText('Baixa encerrada',{exact:true}).waitFor();
    const writes=await page.evaluate(()=>window.writes);assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.deepEqual(writes[0].data,writes[1].data);
    assert.equal(writes[0].data.componentes[0].empresa_id,8);assert.equal(writes[0].data.componentes[0].valor,95);assert.equal(writes[0].data.alocacoes[0].valor,95);
    await alternate();assert.equal(await amount.inputValue(),'');assert.equal(await page.evaluate(()=>window.writes.length),2);
    await goto();await amount.fill('100');await account.selectOption('9');await page.evaluate(()=>window.data.contas=[]);await alternate();
    assert.ok(await review.isDisabled());await page.getByRole('button',{name:'Descartar baixa digitada',exact:true}).click();await amount.fill('100');
    await page.getByLabel('Forma de pagamento *',{exact:true}).selectOption('3');await review.click();await page.getByText('Cada fonte em dinheiro deve usar um caixa fisico com controle de abertura e fechamento.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.previews.length),0);
    await goto();await amount.fill('100');await account.selectOption('9');await page.evaluate(()=>{window.data.titulos[0].status='QUITADO';window.data.titulos[0].valor_saldo=0});await alternate();
    await page.getByRole('alert').filter({hasText:'não estão disponíveis para baixa'}).waitFor();assert.ok(await review.isDisabled());
    await page.evaluate(()=>window.denied=true);await alternate();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByText('TIT-A',{exact:true}).count(),0);
    await page.evaluate(()=>{window.denied=false;window.readonly=true});await alternate();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>window.writes.length),0);
    await goto();const bounds=await page.getByRole('dialog').evaluate(el=>{const r=el.firstElementChild.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}});assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1,JSON.stringify(bounds));
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();await alternate();assert.equal(await obs.inputValue(),'');
    console.log('OK fontes '+width+'px: inputs/alocacoes, consulta atual, cheque derivado, previa explicita, conflito/negativa, caixa fisico e mutex/retry.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('OK baixa composta real com transporte isolado; sem banco/API de negocio.');
}catch(error){console.error(await page?.evaluate(()=>document.body.innerText));throw error}
finally{await browser?.close();await server.close()}
