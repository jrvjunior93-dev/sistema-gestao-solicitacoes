import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import {chromium} from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),stub='\0qa-permutas-';
const plugin={name:'qa-permutas',enforce:'pre',resolveId(s){
  if(s.endsWith('/contexts/AuthContext')||s==='./AuthContext')return stub+'auth';
  if(s.endsWith('/contexts/ThemeContext'))return stub+'theme';
  if(s==='virtual:qa-permutas')return stub+'harness';
  if(s==='../components/padrao')return stub+'padrao';
  if(s==='../services/financeiro')return stub+'api';
},async load(id){
  if(id===stub+'auth')return `const p=new URLSearchParams(location.search),admin=p.has('admin'),perms=p.has('semPermissao')?[]:['financeiro.permutas.'+(p.get('acao')||'usar')];export const useAuth=()=>({user:{id:1,perfil:admin?'ADMINISTRADOR':'USUARIO',financeiro_liberado:true,areas_permissoes_configuradas:true,areas_permissoes:admin?[]:perms,...(admin?{permutas_permissoes:perms}:{})}});`;
  if(id===stub+'theme')return `export const useTheme=()=>({tema:{}});`;
  if(id===stub+'padrao')return `export{default as Pagina}from'/src/components/padrao/Pagina.jsx';export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';`;
  if(id===stub+'api')return `export const getRelatorioPermutas=async(params,signal)=>{(window.__queries||=[]).push(params);if(signal?.aborted)throw Error('Cancelado');return {data:[{id:1,codigo:'TIT-QA',tipo:'PAGAR',data_movimento:'2026-10-18',empresa:'Empresa QA',obra:'Obra QA',parceiro:'Fornecedor QA',status:'ATIVO',forma_recebimento:'PERMUTA',valor_quitacao:60}],resumo:{pagamentos:60,recebimentos:100,estornados:20},paginacao:{total:1,pagina:1,limite:50}}};`;
  if(id===stub+'harness')return (await transformWithEsbuild(`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Instrumento,{payloadInstrumentoFila}from'/src/components/financeiro/InstrumentoPagamentoFila.jsx';import Massa from'/src/components/financeiro/BaixaMassaFilaModal.jsx';import Relatorio from'/src/pages/FinanceiroPermutas.jsx';import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';
  function Operacao(){const[d,setD]=useState({});const formas=[{id:3,nome:'PIX',tipo:'PIX'},{id:9,nome:'Permuta',tipo:'PERMUTA'}];return <div style={{maxWidth:420}}><Instrumento row={{id:1,titulo:{codigo:'TIT-QA'}}} draft={d} instrumentos={{formas,cartoes:[],cheques:[]}} onChange={p=>setD(v=>({...v,...p}))}/><button onClick={()=>window.__payload=payloadInstrumentoFila(d,formas)}>Conferir payload</button></div>};
  function Lote(){return <Massa rows={[{id:1,titulo:{codigo:'TIT-QA'}}]} accounts={[{id:5,nome:'Conta QA',ativo:true,empresa_id:1}]} instrumentos={{formas:[{id:3,nome:'PIX',tipo:'PIX'},{id:9,nome:'Permuta',tipo:'PERMUTA'},{id:10,nome:'Cartao',tipo:'CARTAO'}],cartoes:[],cheques:[]}} drafts={{1:{forma_pagamento_id:3,valor_pago:200,valor_permuta:60,documento_referencia:'Acordo QA',categoria_bem:'MATERIAL'}}} onFechar={()=>{}} onConfirmar={p=>{window.__massa=p;}}/>};
  const params=new URLSearchParams(location.search);
  createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/" element={<p>Acesso restrito</p>}/><Route path="/qa-permutas" element={params.has('relatorio')?<Relatorio/>:params.has('massa')?<Lote/>:<Operacao/>}/></Routes></BrowserRouter>);`,'qa-permutas.jsx',{loader:'jsx',jsx:'automatic'})).code;
},configureServer(server){server.middlewares.use('/qa-permutas',async(_,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-permutas',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:12px;min-width:0"></div><script type="module">import 'virtual:qa-permutas';</script></body></html>`));});}};
const server=await createServer({root,configFile:false,esbuild:{jsx:'automatic'},css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},cacheDir:path.join(root,'../outputs/permutas-qa-cache'),plugins:[plugin],server:{host:'127.0.0.1',port:5327,strictPort:true}});
let browser;
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5327/')?r.continue():r.abort());
  const abrir=async query=>{await page.goto('http://127.0.0.1:5327/qa-permutas'+query);};
  await abrir('');await page.getByLabel('Forma de pagamento de TIT-QA').selectOption('3');await page.getByLabel('Parte em permuta (R$)').fill('60');await page.getByLabel('Referência da permuta').fill('Acordo QA');await page.getByText('Conferir payload',{exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__payload),{forma_pagamento_id:3,valor_permuta:60,documento_referencia:'Acordo QA'});
  await page.getByLabel('Forma de pagamento de TIT-QA').selectOption('9');assert.equal(await page.getByLabel('Parte em permuta (R$)').count(),0);
  await page.getByText('Conferir payload',{exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__payload),{forma_pagamento_id:9});
  await abrir('?acao=relatorio');assert.equal(await page.getByRole('option',{name:'Permuta',exact:true}).count(),0);assert.equal(await page.getByLabel('Parte em permuta (R$)').count(),0);
  await abrir('?admin');assert.equal(await page.getByRole('option',{name:'Permuta',exact:true}).count(),1,'Admin com concessao estrita');
  await abrir('?admin&semPermissao');assert.equal(await page.getByRole('option',{name:'Permuta',exact:true}).count(),0,'Perfil admin nao concede permuta sozinho');
  await abrir('?relatorio&acao=usar');await page.getByText('Acesso restrito',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__queries?.length||0),0);
  await abrir('?massa');await page.getByLabel('Conta pagadora',{exact:true}).selectOption('5');
  await page.getByRole('button',{name:'Conferir e registrar baixas',exact:true}).click();await page.waitForFunction(()=>window.__massa);
  assert.equal(await page.evaluate(()=>window.__massa.pagamentos[1].valor_permuta),60);
  assert.equal(await page.evaluate(()=>window.__massa.pagamentos[1].documento_referencia),'Acordo QA');
  await page.evaluate(()=>{window.__massa=null;});await page.getByLabel('Forma de pagamento do lote',{exact:true}).selectOption('10');
  await page.getByRole('button',{name:'Conferir e registrar baixas',exact:true}).click();await page.getByRole('alert').filter({hasText:'Há títulos com parte em permuta'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__massa),null,'Nao descartar composicao ao trocar para cartao');
  await page.getByLabel('Forma de pagamento do lote',{exact:true}).selectOption('9');
  assert.equal(await page.getByLabel('Conta pagadora',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Conferir e registrar baixas',exact:true}).click();await page.waitForFunction(()=>window.__massa);
  assert.equal(await page.evaluate(()=>window.__massa.conta_bancaria_id),null);
  assert.equal(await page.evaluate(()=>window.__massa.pagamentos[1].valor_permuta),'','Forma integral nao duplica composicao');
  const pasta=path.join(root,'../outputs/permutas-20261018');fs.mkdirSync(pasta,{recursive:true});
  for(const width of [390,768,1366]){
    await page.setViewportSize({width,height:900});await abrir('?relatorio&acao=relatorio');await page.getByText('TIT-QA',{exact:true}).waitFor();
    assert(await page.getByText('Pagamentos realizados',{exact:true}).isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem overflow da pagina');
    await page.screenshot({path:path.join(pasta,`relatorio-${width}.png`),fullPage:true});
  }
  await page.locator('form select').first().selectOption('RECEBER');await page.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForFunction(()=>window.__queries.at(-1)?.tipo==='RECEBER');
  await page.getByRole('button',{name:'Limpar',exact:true}).click();await page.waitForFunction(()=>window.__queries.at(-1)?.tipo==='');
  assert.deepEqual(errors,[]);console.log('Permutas UI: integral/mista/payload, massa preserva partes e bloqueia troca incompativel, permissoes independentes, acesso negado sem consulta, relatorio com filtros/limpeza e larguras390/768/1366 aprovados. APIs simuladas.');
}finally{await browser?.close();await server.close();}
