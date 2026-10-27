// Detalhe real; mocks de servico em memoria. Nunca acessa banco/API real.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import { validarTituloDesvincularFatura } from './tituloDesvincularFaturaQA.mjs';
import { validarTituloDadosPagamentoUI } from './tituloDadosPagamentoQA.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'../outputs/titulo-detalhe-workspace');mkdirSync(output,{recursive:true});
const names=[...readFileSync(path.join(root,'src/services/financeiro.js'),'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m=>m[1]);
const methods={
  getTituloFinanceiroById:`async()=>{await wait();if(window.denied)throw new Error('Título QA negado');return copy(window.titulo)}`,
  getContasBancarias:`async()=>[{id:1,nome:'Conta QA',empresa_id:1,ativo:true}]`,
  desvincularFaturaTituloFinanceiro:`async(id,data)=>{window.writes.push({kind:'desvincular',id,data});await wait();if(window.forceUnlinkError)throw new Error('A fatura prevista não está aberta e sem pagamento.');window.titulo.fatura_cartao_id=null;window.titulo.cartao_id=null;return{titulo_id:id}}`,
  baixarTituloFinanceiro:`async(id,data)=>{window.writes.push({kind:'baixar',id,data});await wait();window.titulo.status='QUITADO';window.titulo.valor_saldo=0;return copy(window.titulo)}`,
  atualizarCobrancaTituloFinanceiro:`async(id,data)=>{window.writes.push({kind:'cobrar',id,data});await wait();Object.assign(window.titulo,data);return copy(window.titulo)}`,
  estornarMovimentoFinanceiro:`async(id,m,data)=>{window.writes.push({kind:'estornar',id,m,data});await wait();window.titulo.status='ABERTO';window.titulo.valor_saldo=100;window.titulo.valor_baixado=0;window.titulo.movimentos[0].status='ESTORNADO';return copy(window.titulo)}`
};
const mocks=`const copy=v=>structuredClone(v),wait=()=>new Promise(r=>setTimeout(r,100));`+names.map(n=>`export const ${n}=${methods[n]||'async()=>[]'};`).join('\n');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Page from'/src/pages/FinanceiroTituloDetalhe.jsx';
window.writes=[];window.denied=false;window.readonly=false;
const query=new URLSearchParams(location.search);const correction=query.has('correcao');
window.titulo={id:1,codigo:'TIT-QA',tipo:query.has('receber')?'RECEBER':'PAGAR',status:correction?'PARCIAL':'ABERTO',valor_original:100,
valor_saldo:correction?60:100,valor_baixado:correction?40:0,empresa_id:1,parceiro:{nome:'Credor QA'},movimentos:correction?[{id:5,status:'ATIVO',valor:40,forma_recebimento:'PIX',data_movimento:'2026-10-12',conta_bancaria_id:1,empresa_id:1}]:[],paymentIntents:[]};
if(query.has('desvincular')){window.titulo.fatura_cartao_id=79;window.titulo.cartao_id=40;window.titulo.forma_pagamento_id=1;window.titulo.total_parcelas=2;}
if(query.has('dados-pagamento')){
  const modo=query.get('dados-pagamento');
  Object.assign(window.titulo,{id:11053,codigo:'TIT-009886',tipo:'PAGAR',status:'QUITADO',valor_saldo:0,valor_baixado:100,
    forma_pagamento_id:3,formaPagamento:{id:3,nome:'Pix',tipo:'PIX'},parceiro:{id:1,nome:'Credor QA'}});
  if(modo==='medicao')Object.assign(window.titulo,{credor_fila:{nome:'Credor contrato QA'},
    instrucao_medicao_fila:{nome_favorecido:'Favorecido medicao QA',forma_pagamento_id:3,favorecido_chave_pix:'15048245636'}});
  if(modo==='solicitacao')window.titulo.solicitacao={favorecido_id:2,favorecido:{id:2,nome:'Favorecido solicitacao QA'},favorecido_chave_pix:'chave-solicitacao@example.test',dados_pagamento:'Contato para confirmar: QA'};
  if(modo==='manual')Object.assign(window.titulo,{favorecido_pagamento_id:3,favorecidoPagamento:{id:3,nome:'Favorecido titulo QA'},observacoes:'Banco 104; Agencia 123; Conta 456-7'});
  if(modo==='dados')Object.assign(window.titulo,{forma_pagamento_id:4,formaPagamento:{id:4,nome:'Transferencia',tipo:'TRANSFERENCIA'},
    instrucao_favorecido:{nome_favorecido:'Favorecido parte QA',forma_pagamento_id:4,forma_pagamento_nome:'Transferencia',forma_pagamento_tipo:'TRANSFERENCIA',
      dados_pagamento:'Banco 104; Agencia 123; Conta 456-7; '+('Instrucao integral sem truncamento. '.repeat(100))}});
  if(modo==='pix-longo')Object.assign(window.titulo,{pagamento_negociacao:{nome_favorecido:'Favorecido negociacao QA',forma_pagamento_id:3,forma_pagamento_tipo:'PIX',
    favorecido_chave_pix:'000201'+('aB0123456789/'.repeat(300))}});
}
window.readonly=query.has('readonly');window.forceUnlinkError=query.has('recusa');
function App(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'titulo-qa',memory,snapshot:true,active:true}}>{active?<Page/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Routes><Route path='*' element={<main className='layout-main'><App/></main>}/></Routes></ThemeContext.Provider></BrowserRouter>);`;
const server=await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(output,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{name:'titulo-detalhe-qa',enforce:'pre',
  resolveId(id){if(id==='/fixture.jsx')return '\0qa-titulo-detalhe.jsx'},
  async load(id){if(id==='\0qa-titulo-detalhe.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
  transform(_code,id){if(id.endsWith('/src/services/financeiro.js'))return mocks;
    if(id.endsWith('/src/modules/fiscal/services/fiscalApi.js'))return [..._code.matchAll(/export (?:async )?function (\w+)/g)].map(m=>`export async function ${m[1]}(){return [];}`).join('\n');
    if(id.endsWith('/src/contexts/AuthContext.jsx'))return "export const useAuth=()=>({user:window.readonly?{id:2,perfil:'USUARIO',area:'OBRA',areas_permissoes_configuradas:true,areas_permissoes:['financeiro.titulos.visualizar']}:{id:1,perfil:'SUPERADMIN',area:'FINANCEIRO'}});";
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();
  page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async(search='')=>{await page.goto(base+search);await page.addStyleTag({path:path.join(root,'dist/assets',css)})};
  const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
  if(process.argv.includes('--dados-pagamento')) await validarTituloDadosPagamentoUI(page, goto, alternate, output);
  else await validarTituloDesvincularFatura(page, goto, alternate, output);
  if(!process.argv.includes('--desvincular-fatura')&&!process.argv.includes('--dados-pagamento')) for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto();
    await page.getByRole('button',{name:'Registrar baixa',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'Registrar baixa',exact:true});
    await modal.getByLabel('Forma de pagamento',{exact:true}).selectOption('PIX');
    await modal.getByLabel('Conta bancaria',{exact:true}).selectOption('1');
    const interest=modal.getByLabel('Juros',{exact:true});await interest.fill('10,00');await interest.blur();
    await alternate();await interest.waitFor();assert.match(await interest.inputValue(),/10,00$/);
    assert.equal(await modal.getByLabel('Forma de pagamento',{exact:true}).inputValue(),'PIX');
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.titulo.valor_saldo=80);await alternate();await modal.getByRole('alert').waitFor();
    assert.ok(await modal.getByRole('button',{name:'Confirmar baixa',exact:true}).isDisabled());
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.denied=true;window.qaTab(true)});await page.getByText('Título financeiro não encontrado.',{exact:true}).waitFor();
    assert.equal(await modal.count(),0);assert.equal(await page.getByText('TIT-QA',{exact:true}).count(),0);
    await goto();await page.getByRole('button',{name:'Registrar baixa',exact:true}).click();
    await modal.getByLabel('Forma de pagamento',{exact:true}).selectOption('PIX');await modal.getByLabel('Conta bancaria',{exact:true}).selectOption('1');
    await modal.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});await modal.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.writes.length),1);await alternate();await page.getByText('Titulo TIT-QA',{exact:true}).waitFor();
    assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>window.writes.length),1);

    await goto('?receber=1');await page.getByRole('button',{name:/Cobrança externa/}).click();
    const barcode=page.getByLabel('Linha digitável',{exact:true});await barcode.fill('Linha Z');
    await alternate();await barcode.waitFor();assert.equal(await barcode.inputValue(),'Linha Z');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.titulo.linha_digitavel='Outra linha');await alternate();await page.getByRole('alert').waitFor();
    assert.ok(await page.getByRole('button',{name:'Salvar dados de cobranca',exact:true}).isDisabled());

    await goto('?correcao=1');await page.getByRole('button',{name:'Corrigir baixa',exact:true}).click();
    await page.getByRole('button',{name:'Estornar e corrigir',exact:true}).click();await modal.waitFor();
    await interest.fill('2,00');await interest.blur();await alternate();await interest.waitFor();
    assert.match(await interest.inputValue(),/2,00$/);assert.equal(await page.evaluate(()=>window.writes.length),1);
    assert.equal(await page.evaluate(()=>window.writes[0].kind),'estornar');
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.readonly=true;window.qaTab(true)});await page.getByText('Titulo TIT-QA',{exact:true}).waitFor();
    assert.equal(await modal.count(),0);assert.equal(await page.getByRole('button',{name:'Registrar baixa',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.writes.length),1);
    console.log('OK titulo detalhe '+width+'px: baixa/cobranca/correcao, saldo/permissao atual, 403, sem replay e duplo envio.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);if(page){await page.screenshot({path:path.join(output,'falha.png')});console.error((await page.locator('body').innerText()).slice(0,5000))}throw error}
finally{await browser?.close();await server.close()}
