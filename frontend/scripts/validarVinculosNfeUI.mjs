// Paginas/componentes reais, controllers reais e servico fiscal com SQLite local.
// Autenticacao/layout sao adaptadores QA; nenhuma chamada externa e permitida.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {fixture}=require('../../backend/scripts/fixtures/vinculosNfeDbFixture.cjs');
const f=await fixture(),financialBefore=f.financial();
const controller={exports:{}};
vm.runInNewContext(await fs.readFile(path.join(root,'../backend/src/modules/fiscal/controllers/FiscalPurchaseLinkController.js'),'utf8'),{
  module:controller,require:name=>{assert.equal(name,'../services/fiscalPurchaseLinkService');return f.service;}
});
const keys=[],external=[],errors=[];let uiOrigin,failAfterCommit=true;
const api=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',uiOrigin||'');res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key,X-CSRF-Token,X-Audit-Session-Id');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  const u=new URL(req.url,'http://qa.local'),route=u.pathname.replace(/^\/api\/fiscal/,'');
  const request={user:{id:5},query:Object.fromEntries(u.searchParams),params:{},get:name=>req.headers[name.toLowerCase()]};
  const response={status(n){res.statusCode=n;return this;},json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return this;}};
  if(route==='/purchase-links/orders')return controller.exports.search(request,response);
  if(route==='/purchase-links')return controller.exports.read(request,response);
  const match=route.match(/^\/documents\/(\d+)\/purchase-links(?:\/(\d+)\/end)?$/);
  if(req.method==='POST'&&match){
    if(req.headers.authorization!=='Bearer QA_LOCAL')return response.status(401).json({error:'Sem sessao QA'});
    keys.push(req.headers['idempotency-key']);let body='';for await(const b of req)body+=b;
    request.body=JSON.parse(body);request.params={id:match[1],pedidoId:match[2]};
    if(!match[2]&&failAfterCommit){
      const original=response.json.bind(response);response.json=data=>{
        if(data.outcome==='FISCAL_PURCHASE_LINKED'){failAfterCommit=false;setTimeout(()=>original({error:'Falha simulada apos commit'}),120);res.statusCode=500;return response;}
        return original(data);
      };
    }
    return match[2]?controller.exports.remove(request,response):controller.exports.save(request,response);
  }
  response.status(404).json({error:'Rota QA nao prevista'});
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const apiOrigin=`http://127.0.0.1:${api.address().port}`;
const doc={id:1,document_number:'101',issuer_name:'Fornecedor QA',total_value:'300.00'};
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Nfe from '/src/modules/fiscal/components/VinculosNfe.jsx';import Pedido from '/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx';
import{setAuthToken,installFetchSecurityDefaults}from'/src/services/api.js';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
setAuthToken('QA_LOCAL');installFetchSecurityDefaults();window.qaCalls=[];
const mode=new URLSearchParams(location.search).get('mode');
window.qaUser=mode==='readonly'?{id:5,perfil:'USUARIO',areas_permissoes:['fiscal.document.view']}:{id:5,perfil:'SUPERADMIN'};
function Root(){const[order,setOrder]=useState({id:25,status:'ABERTO',fornecedor:{nome:'QA',parceiro_id:6},obra:{nome:'Obra QA'},valor_total_fornecedor:100,fretes:[],financeiro:{pedido_id:25,status:'NAO_INICIADO',legado:false,titulos:[],opcoes:{categorias:[],formas_pagamento:[]}}});
return<MemoryRouter><div style={{maxWidth:'1100px',margin:'12px auto',padding:'8px'}}>{mode==='pedido'?<Pedido pedido={order} user={window.qaUser}
avisar={{sucesso:()=>{},erro:message=>{throw Error(message)},alerta:()=>{}}}onAtualizar={()=>setOrder(o=>({...o,status:'FECHADO_FORNECEDOR'}))}/>
:mode==='titulo'?<Nfe tituloId={11} user={window.qaUser}/>:<Nfe documento={${JSON.stringify(doc)}} user={window.qaUser}/>}</div></MemoryRouter>}
createRoot(document.getElementById('root')).render(<Root/>);`;
const layout=`import React from'react';export{useConfirmacao}from'/src/components/padrao/Confirmacao.jsx';
export const BlocoConteudo=({children,titulo,descricao})=><section className='app-card p-3'><h2 className='font-semibold'>{titulo}</h2><p>{descricao}</p>{children}</section>;
export const CampoForm=({children,label})=><label>{label}{children}</label>;
export const FormSecao=({children})=><div className='flex flex-wrap gap-2'>{children}</div>;`;
const compras=`const noop=async()=>({});export{noop as adotarFinanceiroPedidoCompra,noop as criarPrevisoesPedidoCompra,
noop as decidirReaberturaPedidoCompra,noop as obterUrlAssinadaCompra,noop as reparcelarPrevisoesPedidoCompra,
noop as removerArquivoDocumentoPedidoCompra,noop as uploadAnexoTemporarioCompra};
export const atualizarStatusPedidoCompra=async(id,body)=>{window.qaCalls.push({id,...body});return{};};`;
const virtual={'\0nfe-entry.jsx':entry,'\0nfe-layout.jsx':layout,'\0nfe-compras.js':compras,
  '\0nfe-viewer.js':'export default()=>({abrirPreview:()=>{},modalPreview:null});',
  '\0nfe-auth.js':'export const useAuth=()=>({user:window.qaUser});',
  '\0nfe-empty.jsx':"import React from'react';export default()=>null;"};
const vite=await createServer({root,configFile:false,envFile:false,logLevel:'error',
  define:{'import.meta.env.VITE_API_URL':JSON.stringify(apiOrigin+'/api')},
  css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},server:{host:'127.0.0.1',port:0},
  plugins:[{name:'qa-nfe-pedidos',enforce:'pre',resolveId(id,importer){
    if(id==='/qa-nfe.jsx')return'\0nfe-entry.jsx';
    if(id.includes('contexts/AuthContext'))return'\0nfe-auth.js';
    if(!importer?.replaceAll('\\','/').includes('/src/'))return;
    if(id.endsWith('components/padrao'))return'\0nfe-layout.jsx';
    if(id.endsWith('hooks/useVisualizadorArquivo'))return'\0nfe-viewer.js';
    if(id.endsWith('services/compras'))return'\0nfe-compras.js';
    if(id.includes('TitulosCompartilhadosModal')||id.includes('ParceiroBuscaRemota'))return'\0nfe-empty.jsx';
  },load(id){if(Object.hasOwn(virtual,id))return id.endsWith('.jsx')?transformWithEsbuild(virtual[id],id,{loader:'jsx',jsx:'transform'}):virtual[id];},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/qa-nfe')return next();res.setHeader('Content-Type','text/html');
    res.end(await server.transformIndexHtml('/qa-nfe','<html><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/qa-nfe.jsx"></script></body></html>'));
  });}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
  await vite.listen();uiOrigin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:950}});
  await context.route('**/*',r=>{if([uiOrigin,apiOrigin].some(o=>r.request().url().startsWith(o+'/')))return r.continue();external.push(r.request().url());return r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(uiOrigin+'/qa-nfe');await page.getByText('Nenhuma NF-e vinculada neste contexto.').waitFor();
  await page.getByRole('button',{name:'Vincular / revisar NF-e e pedidos',exact:true}).click();
  await page.getByText('NF-e 101 · Fornecedor QA · Total').waitFor();
  for(const id of[10,11,12]){
    await page.getByLabel('Buscar pedido por PC ou código da solicitação').fill('PC-'+id);
    await page.getByRole('button',{name:'Buscar pedidos',exact:true}).click();
    await page.getByRole('button',{name:'Adicionar pedido',exact:true}).click();
  }
  await page.getByLabel('Observação da conferência').fill('NF-e atende pedidos de duas solicitacoes.');
  await page.getByRole('checkbox',{name:/Conferi NF-e/}).check();
  const output=path.join(root,'../outputs/qa-vinculos-nfe');await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'conferencia-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Confirmar vínculos fiscais',exact:true}).dblclick();
  await page.getByRole('alert').filter({hasText:'Falha simulada apos commit'}).waitFor();
  assert.equal(keys.length,1,'Multiplos cliques fazem um envio');
  await page.getByRole('button',{name:'Confirmar vínculos fiscais',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Vinculos registrados'}).waitFor();
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1],'Retry preserva chave e corpo');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,6);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_events').get().n,1);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'vinculos-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Pagina nao vaza horizontalmente');
  await page.getByRole('button',{name:'Encerrar vínculo',exact:true}).first().click();
  await page.getByLabel('Observação da conferência').fill('Associacao encerrada para teste.');
  await page.getByRole('checkbox',{name:/Conferi NF-e/}).check();
  await page.getByRole('button',{name:'Confirmar encerramento',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Vinculo encerrado'}).waitFor();
  assert.equal(f.financial(),financialBefore);
  await page.goto(uiOrigin+'/qa-nfe?mode=titulo');await page.getByText('NF-e 101',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Vincular / revisar NF-e e pedidos',exact:true}).count(),0);
  await page.goto(uiOrigin+'/qa-nfe?mode=readonly');
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('button',{name:'Vincular / revisar NF-e e pedidos',exact:true}).count(),0);
  await page.goto(uiOrigin+'/qa-nfe?mode=pedido');
  await page.getByRole('button',{name:'Vincular / revisar NF-e e pedidos',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.qaCalls),[],'Consultar vinculos nao muda status do pedido');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('OK UI: multi-pedidos/solicitacoes, retry apos commit, um envio, historico/baixa parcial, leitura do titulo e pedido, permissoes e mobile. Sem mudar a criacao de titulos da main.');
}finally{await browser?.close();await vite.close();await new Promise(resolve=>api.close(resolve));f.close();}
