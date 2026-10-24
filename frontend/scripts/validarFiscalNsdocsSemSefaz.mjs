// Paginas React reais, apenas API/layout adaptados. Rede externa bloqueada.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const api=`window.qaCalls=[];const record=n=>window.qaCalls.push(n);
export const getFiscalSyncLogs=async()=>{record('logs');return {data:[{id:7,started_at:'2026-10-24T14:30:00Z',status:'success',company:{razao_social:'Empresa ficticia'},raw_request_storage_key:'prod/legado.xml',response_message:'Histórico preservado'}]};};
export const getFiscalSyncStates=async()=>{record('estados');return {data:[{id:1,company:{razao_social:'Empresa ficticia'},ambiente_sefaz:'producao',ult_nsu:'123',status:'success'}]};};
export const getFiscalSyncLogRawUrl=async(id,type)=>{record('assinar:'+id+':'+type);return {url:'about:blank'};};
export const getFiscalDiagnostics=async()=>{record('diagnostico');if(window.qaDenied)throw Error('Sem permissão para diagnóstico');return {modulo:{enabled:true,env:'production'},storage:{configured:true,region:'us-east-2'},crypto:{configured:true},dados:{empresas_total:1},sefaz:{enabled:true},ultimo_log:{id:7,status:'success'}};};
export const runFiscalStorageProbe=async()=>{record('probe-storage');return {ok:true};};
const blocked=()=>{record('CONSULTA_SEFAZ_PROIBIDA');throw Error('PROIBIDO');};
export {blocked as runFiscalManualSync,blocked as runFiscalSyncPreflight,blocked as runFiscalFixtureSync};`;
const layout=`import React from 'react';const avisar={erro:m=>window.qaCalls.push('erro:'+m),sucesso:()=>{},alerta:()=>{},informacao:()=>{}};
export const useAvisos=()=>({avisos:[],avisar,fechar:()=>{}});export const Avisos=()=>null;
export const Pagina=({children})=><main>{children}</main>;
export const PageHeader=({titulo,acaoPrincipal,secundarias=[]})=><header><h1>{titulo}</h1>{[acaoPrincipal,...secundarias].filter(Boolean).map((a,i)=><button key={i} onClick={a.onClick}>{a.rotulo}</button>)}</header>;
export const BlocoConteudo=({children,titulo,acoes})=><section aria-label={titulo}><h2>{titulo}</h2>{acoes}{children}</section>;
export const BlocosPersonalizaveis=({children})=><div>{children}</div>;
export const StatGrid=({children})=><div>{children}</div>;
export const StatTile=({label,valor})=><div>{label}: {valor}</div>;
export const CamposComVazios=({campos})=><dl>{campos.map((x,i)=><div key={i}><dt>{x.label}</dt><dd>{x.valor}</dd></div>)}</dl>;
export const TabelaPadrao=({itens=[],colunas,acoesLinha})=><table><tbody>{itens.map((x,i)=><tr key={i}>{colunas.map((c,j)=><td key={j}>{c.render?.(x)}</td>)}<td>{acoesLinha?.(x)}</td></tr>)}</tbody></table>;`;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Logs from '/src/modules/fiscal/pages/FiscalLogs.jsx';import Diagnostics from '/src/modules/fiscal/pages/FiscalDiagnostics.jsx';
window.qaDenied=new URLSearchParams(location.search).has('denied');createRoot(document.getElementById('root')).render(location.search.includes('logs')?<Logs/>:<Diagnostics/>);`;
const virtual={'\0qa-fiscal-ui.jsx':entry,'\0qa-fiscal-api.js':api,'\0qa-fiscal-layout.jsx':layout,
 '\0qa-fiscal-status.jsx':`import React from 'react';export default({status})=><span>{status}</span>;`};
const server=await createServer({root,configFile:false,logLevel:'error',envFile:false,server:{host:'127.0.0.1',port:0},css:{postcss:{plugins:[]}},
 plugins:[{name:'qa-nsdocs-ui',enforce:'pre',resolveId(id,importer){
  if(id==='/qa-fiscal.jsx')return '\0qa-fiscal-ui.jsx';
  if(!importer?.replaceAll('\\','/').includes('/modules/fiscal/pages/'))return;
  if(id==='../services/fiscalApi')return '\0qa-fiscal-api.js';
  if(id==='../../../components/padrao')return '\0qa-fiscal-layout.jsx';
  if(id==='../../../components/StatusBadge')return '\0qa-fiscal-status.jsx';
 },load(id){if(virtual[id])return id.endsWith('.jsx')?transformWithEsbuild(virtual[id],id,{loader:'jsx',jsx:'transform'}):virtual[id];},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(req.url?.split('?')[0]!=='/qa-fiscal')return next();res.setHeader('Content-Type','text/html');
  res.end(await s.transformIndexHtml('/qa-fiscal','<html><body><div id="root"></div><script type="module" src="/qa-fiscal.jsx"></script></body></html>'));
 });}},react()],optimizeDeps:{include:['react','react-dom/client']}});
let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),external=[],errors=[];
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/qa-fiscal?logs');await page.getByText('Histórico preservado',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Sincronizar|preflight|fixture|Registrar tentativa/i}).count(),0);
  const wait=page.waitForEvent('popup');await page.getByRole('button',{name:'Request',exact:true}).click();await(await wait).close();
  assert.deepEqual(await page.evaluate(()=>window.qaCalls),['logs','estados','assinar:7:request']);
  await page.goto(origin+'/qa-fiscal');await page.getByText('NSDOCS — manual',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Sincronizar|preflight|fixture|Consultar SEFAZ/i}).count(),0);
  await page.getByRole('button',{name:'Testar storage',exact:true}).click();
  await page.getByText('Resultado do teste:',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.qaCalls),['diagnostico','probe-storage']);
  await page.goto(origin+'/qa-fiscal?denied');await page.waitForFunction(()=>window.qaCalls.some(x=>x.startsWith('erro:')));
  assert.deepEqual(await page.evaluate(()=>window.qaCalls),['diagnostico','erro:Sem permissão para diagnóstico']);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Paginas fiscais reais desktop/mobile: sem acoes SEFAZ, historico/payload assinado e storage preservados; erro de permissao tratado; zero rede externa.');
}finally{await browser?.close();await server.close();}
