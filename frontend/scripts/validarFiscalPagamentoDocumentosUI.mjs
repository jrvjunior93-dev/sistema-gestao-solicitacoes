// Telas/cliente HTTP/controller/consulta fiscal reais; sessao e armazenamento
// sao adaptadores QA. SQLite em memoria. Proibida qualquer rede externa.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {fixture}=require('../../backend/scripts/fixtures/fiscalPagamentoFixture.cjs'),f=await fixture(),before=f.snapshot();
const {Op}=createRequire(path.join(root,'../backend/package.json'))('sequelize');
const controller=require('../../backend/src/controllers/FiscalPagamentoDocumentosController.js').createController(f.service);
const legacy={exports:{}};
vm.runInNewContext(await fs.readFile(path.join(root,'../backend/src/services/solicitacaoFilaPagamentoAcessoService.js'),'utf8'),{
  module:legacy,require:name=>{
    if(name==='../models')return f.db;if(name==='sequelize')return{Op};
    if(name==='./authorizationService')return{canAccessFilaPagamentos:f.access.queue};
    if(name==='./fiscalPagamentoDocumentosService')return f.service;throw Error('Dependencia QA nao prevista: '+name);
  }
});
// PDF valido ficticio, sem dados de cliente ou interpretacao de XML externo.
function pdf(){
  const stream='BT /F1 20 Tf 60 760 Td (NF-e 101 - DANFE FICTICIO QA) Tj 0 -40 Td (Consulta de teste - sem valor fiscal) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
  let out='%PDF-1.4\n';const offsets=[0];objects.forEach((o,n)=>{offsets.push(out.length);out+=(n+1)+' 0 obj\n'+o+'\nendobj\n';});
  const xref=out.length;out+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(out+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
}
let uiOrigin,apiOrigin,slow=false;const requests=[],errors=[],external=[];
const api=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',uiOrigin||'');res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,X-CSRF-Token,X-Audit-Session-Id');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  const u=new URL(req.url,'http://qa.local');
  const response={setHeader:(k,v)=>res.setHeader(k,v),status(n){res.statusCode=n;return this;},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));return this;}};
  if(u.pathname==='/signed/danfe.pdf'){res.setHeader('Content-Type','application/pdf');res.end(pdf());return;}
  if(u.pathname==='/signed/nota.xml'){res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="NF-e101.xml"');res.end('<nfe>FICTICIO</nfe>');return;}
  requests.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams)});
  if(req.method!=='GET')return response.status(405).json({error:'Mutacao proibida neste QA'});
  if(req.headers.authorization!=='Bearer QA_LOCAL')return response.status(401).json({error:'Sem sessao QA'});
  if(u.pathname==='/api/financeiro/autorizacoes-pagamento/notas-fiscais'){
    if(slow)await new Promise(resolve=>setTimeout(resolve,350));
    return controller.owner({user:f.req.user,query:Object.fromEntries(u.searchParams)},response);
  }
  const match=u.pathname.match(/^\/api\/financeiro\/fila-pagamentos\/solicitacoes\/(\d+)\/(arquivos|notas-fiscais)$/);
  if(match){
    if(match[2]==='notas-fiscais')return controller.queue({user:f.req.user,params:{id:match[1]},query:Object.fromEntries(u.searchParams)},response);
    try{return response.json(await legacy.exports.listarArquivosSolicitacaoPelaFila(f.req.user,match[1]));}
    catch(e){return response.status(e.statusCode||500).json({error:e.message});}
  }
  errors.push('Rota QA inesperada: '+u.pathname);return response.status(404).json({error:'Rota QA desconhecida'});
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));apiOrigin=`http://127.0.0.1:${api.address().port}`;
// Assinatura simulada conserva a selecao de chave e a validade solicitada pelo
// servico real; nao usa AWS. O conteudo servido e o PDF/XML ficticio acima.
const signRecord=[];const realSigned=f.signed;
realSigned.push=(...entries)=>{signRecord.push(...entries);return Array.prototype.push.apply(realSigned,entries);};
const originalOwner=f.service.owner,originalQueue=f.service.queue;
const localFile=result=>result?.url?{...result,url:apiOrigin+(result.mime_type==='application/pdf'?'/signed/danfe.pdf':'/signed/nota.xml')}:result;
f.service.owner=async(...a)=>localFile(await originalOwner(...a));f.service.queue=async(...a)=>localFile(await originalQueue(...a));
const item={id:100,titulo_financeiro_id:10,lote_id:9,lote:{codigo:'LOTE-QA'},status:'PENDENTE',situacao_financeira:'AGUARDANDO',valor_snapshot:60,
  snapshot_hash:'hash-original',snapshot_json:{codigo:'TIT-10',solicitacao:{codigo:'SOL-QA',descricao:'Compra ficticia para homologacao'},valor_saldo:60},
  documentos:[{id:999,nome:'solicitacao-original.pdf'}],titulo:{status:'PARCIAL',valor_baixado:40,valor_saldo:60}};
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Owner from'/src/components/financeiro/AutorizacaoTituloDetalhe.jsx';import Queue from'/src/components/financeiro/ArquivosSolicitacaoFilaModal.jsx';
import{setAuthToken,installFetchSecurityDefaults}from'/src/services/api.js';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/components/lista-avancada/lista-avancada.css';import'/src/styles/escala.css';
import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';import'/src/styles/financeiro-autorizacoes-pagamento.css';
setAuthToken('QA_LOCAL');installFetchSecurityDefaults();window.qaBiometryCalls=0;
const mode=new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')).render(<MemoryRouter>{mode==='queue'?<Queue solicitacao={{id:100,codigo:'SOL-QA'}}onFechar={()=>{}}/>:
<Owner inicial={${JSON.stringify(item)}} filtro={{}}caps={{can_view:true,can_decide:false,passkey_count:0}}setBusy={()=>{}}abrirDocumento={()=>{}}onFechar={()=>{}}onDecidido={()=>{}}/>}</MemoryRouter>);`;
const approval=`export const listarTitulosAutorizacao=async()=>({data:[${JSON.stringify(item)}]});
const blocked=()=>{window.qaBiometryCalls++;throw Error('Decisao nao autorizada no teste de leitura');};
export{blocked as obterOpcoesDecisaoPasskey,blocked as decidirAutorizacaoPagamento,blocked as obterOpcoesRejeicaoFilaDireta,blocked as rejeitarFilaDireta,blocked as reenviarAutorizacaoParaFila};`;
const virtual={'\0qa-fiscal-pg-entry.jsx':entry,'\0qa-fiscal-pg-approval.js':approval,
  '\0qa-fiscal-pg-boleto.js':`export const getLinkSeguroAnexoSolicitacao=async()=>${JSON.stringify(apiOrigin+'/signed/danfe.pdf')};`};
const vite=await createServer({root,configFile:false,envFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  define:{'import.meta.env.VITE_API_URL':JSON.stringify(apiOrigin+'/api')},css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},
  plugins:[{name:'qa-fiscal-pagamentos',enforce:'pre',resolveId(id){
    if(id==='/qa-fiscal-pg.jsx')return'\0qa-fiscal-pg-entry.jsx';
    if(id.endsWith('services/pagamentoAutorizacao'))return'\0qa-fiscal-pg-approval.js';
    if(id.endsWith('services/solicitacoes'))return'\0qa-fiscal-pg-boleto.js';
  },load(id){if(Object.hasOwn(virtual,id))return id.endsWith('.jsx')?transformWithEsbuild(virtual[id],id,{loader:'jsx',jsx:'transform'}):virtual[id];},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/qa-fiscal-pg')return next();res.setHeader('Content-Type','text/html');
    res.end(await server.transformIndexHtml('/qa-fiscal-pg','<html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/qa-fiscal-pg.jsx"></script></body></html>'));
  });}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
  await vite.listen();uiOrigin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  if(process.argv.includes('--preview')){
    console.log(JSON.stringify({outcome:'QA_FISCAL_PREVIEW_LOCAL',url:uiOrigin+'/qa-fiscal-pg',pid:process.pid,ficticio:true,duracao_segundos:300}));
    await new Promise(resolve=>setTimeout(resolve,300000));
  }else{
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1366,height:960},timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  await context.route('**/*',route=>{
    const url=route.request().url();
    // Recursos internos do renderizador PDF do Chrome, sem acesso a internet.
    if(url.startsWith('chrome://resources/')||url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'))return route.continue();
    if([uiOrigin,apiOrigin].some(o=>url.startsWith(o+'/')))return route.continue();external.push(url);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(uiOrigin+'/qa-fiscal-pg');
  const owner=page.getByRole('dialog',{name:'Detalhes do título para autorização',exact:true});
  await owner.getByRole('button',{name:'Consultar NF-e vinculadas',exact:true}).waitFor();
  assert.equal(requests.length,0);assert.equal(f.signed.length,0);
  await owner.getByRole('button',{name:'Consultar NF-e vinculadas',exact:true}).click();
  await owner.getByRole('button',{name:'NF-e 101 - DANFE.pdf',exact:true}).waitFor();
  assert.equal(f.signed.length,0);assert.equal(await owner.getByRole('button',{name:'NF-e 101 - XML.xml',exact:true}).count(),1);
  const out=path.join(root,'../outputs/fiscal-pagamentos-documentos-20261024');await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'dossie-desktop.png'),fullPage:true});
  await owner.getByRole('button',{name:'NF-e 101 - DANFE.pdf',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'NF-e 101 - DANFE.pdf',exact:true});await preview.locator('iframe').waitFor();
  assert.equal(await preview.locator('iframe').getAttribute('src'),apiOrigin+'/signed/danfe.pdf');
  const pdfResponse=await context.request.get(apiOrigin+'/signed/danfe.pdf');
  assert.equal(pdfResponse.headers()['content-type'],'application/pdf');assert((await pdfResponse.body()).subarray(0,8).toString().startsWith('%PDF-1.4'));
  let nativePdf;
  for(let attempts=0;attempts<60&&!nativePdf;attempts++){
    nativePdf=page.frames().find(frame=>frame.url().startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'));
    if(!nativePdf)await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert(nativePdf,'Renderizador PDF nativo nao carregou');await nativePdf.locator('viewer-toolbar').waitFor();
  await nativePdf.locator('embed').waitFor({state:'attached'});
  await nativePdf.locator('#pageSelector').waitFor({state:'visible',timeout:5000});
  assert.equal(await nativePdf.locator('#pageSelector').inputValue(),'1');
  assert.equal(f.signed.length,1);assert.equal(signRecord[0][1],180);
  await page.screenshot({path:path.join(out,'danfe-preview.png'),fullPage:true});
  await page.keyboard.press('Escape');assert(await owner.isVisible());assert.equal(await preview.count(),0);
  await owner.getByRole('button',{name:'NF-e 101 - XML.xml',exact:true}).click();
  const xml=page.getByRole('dialog',{name:'NF-e 101 - XML.xml',exact:true});await xml.waitFor();assert.equal(await xml.locator('iframe').count(),0);
  const download=page.waitForEvent('download');await xml.getByRole('link',{name:'Baixar arquivo',exact:true}).click();
  assert((await fs.readFile(await(await download).path(),'utf8')).includes('FICTICIO'));
  await xml.getByRole('button',{name:'Fechar',exact:true}).click();
  f.state.owner=false;await owner.getByRole('button',{name:'Atualizar NF-e',exact:true}).click();
  await owner.getByRole('alert').waitFor();assert.equal(await owner.getByRole('button',{name:'NF-e 101 - DANFE.pdf',exact:true}).count(),0);
  f.state.owner=true;await page.setViewportSize({width:390,height:844});await owner.getByRole('button',{name:'Consultar NF-e vinculadas',exact:true}).click();
  await owner.getByRole('button',{name:'NF-e 101 - DANFE.pdf',exact:true}).waitFor();await page.screenshot({path:path.join(out,'dossie-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.evaluate(()=>window.qaBiometryCalls),0);
  await page.goto(uiOrigin+'/qa-fiscal-pg?mode=queue');
  const queue=page.getByRole('dialog',{name:'Arquivos da solicitação SOL-QA',exact:true});await queue.getByText('NF-e 101 - DANFE.pdf',{exact:true}).waitFor();
  assert.equal(await queue.getByRole('listitem').count(),3);await queue.getByText('boleto-qa.pdf',{exact:true}).waitFor();
  await queue.getByRole('button',{name:'Visualizar NF-e 101 - DANFE.pdf',exact:true}).click();await preview.locator('iframe').waitFor();
  await preview.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.setViewportSize({width:1366,height:960});await page.screenshot({path:path.join(out,'fila-arquivos.png'),fullPage:true});
  const previousSigns=f.signed.length;
  f.sql.exec("UPDATE fiscal_document_links SET link_status='rejected'");
  await queue.getByRole('button',{name:'Baixar NF-e 101 - XML.xml',exact:true}).click();await queue.getByRole('alert').waitFor();
  assert.equal(f.signed.length,previousSigns); // arquivo listado anteriormente deixou de estar vinculado
  f.sql.exec("UPDATE fiscal_document_links SET link_status='manually_linked'");
  assert.equal(await page.evaluate(()=>window.qaBiometryCalls),0);assert(requests.every(r=>r.method==='GET'));
  assert.equal(f.snapshot(),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('QA aprovado: dossie/fila reais, NF-e/boletos, assinatura sob demanda, preview/Escape/download XML, negativa/remocao, mobile, hashes/baixas e nenhuma biometria extra. Rede/DB/AWS/NSDOCS reais nao usados.');
  await context.close();
  }
}finally{await browser?.close();await vite.close();await new Promise(resolve=>api.close(resolve));f.close();}
