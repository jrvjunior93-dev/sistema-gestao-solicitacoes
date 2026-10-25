// Pagina/hook reais, metadados ficticios e API local simulada. Sem login/rede real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const api=`window.qa={calls:[],companies:0,mutations:0,failNext:false,slow:false,files:[],aborted:0,inFlight:0,maxInFlight:0};
const rows=Array.from({length:125},(_,i)=>({id:i+1,issuer_name:'Fornecedor QA '+(i+1),document_number:String(i+1),emission_date:'2026-10-16T00:00:00.000Z',source:'nsdocs_v2_manual',document_status:'xml_downloaded',xml_storage_key:'fixture-'+(i+1)}));
export const getFiscalCompanies=async()=>{window.qa.companies++;return {data:[{id:1,razao_social:'Empresa QA'}]};};
export const getFiscalDocuments=(params,{signal}={})=>new Promise((resolve,reject)=>{
 window.qa.calls.push({...params});window.qa.inFlight++;window.qa.maxInFlight=Math.max(window.qa.maxInFlight,window.qa.inFlight);const delay=window.qa.slow?400:15;
 let finished=false;const timer=setTimeout(()=>{if(finished)return;finished=true;window.qa.inFlight--;
  if(window.qa.failNext){window.qa.failNext=false;reject(Error('FALHA FICTICIA'));return;}
  const filtered=params.q?rows.filter(d=>d.document_number===params.q):rows;
  resolve({data:filtered.slice((params.page-1)*params.limit,params.page*params.limit),pagination:{page:params.page,limit:params.limit,total:filtered.length,pages:Math.ceil(filtered.length/params.limit)}});
 },delay);
 signal?.addEventListener('abort',()=>{if(finished)return;finished=true;window.qa.inFlight--;window.qa.aborted++;clearTimeout(timer);reject(new DOMException('cancelado','AbortError'));},{once:true});
});
export const getFiscalDocumentFileUrl=async(id,type)=>{window.qa.files.push({id,type});return {url:'about:blank'};};
const blocked=()=>{window.qa.mutations++;throw Error('Mutacao nao autorizada no QA');};
export {blocked as generateFiscalDocumentDanfe,blocked as uploadFiscalXml};`;
const layout=`import React from 'react';
export const Pagina=({children})=><main>{children}</main>;
export const BlocoConteudo=({children,titulo,acoes})=><section aria-label={titulo}><h2>{titulo}</h2>{acoes}{children}</section>;
export const PageHeader=({titulo,contagem})=><header><h1>{titulo}</h1><span data-total>{contagem}</span></header>;
export const TabelaPadrao=({colunas,itens=[],acoesLinha,storageKey,carregando,paginaLocal})=><div data-key={storageKey} data-pagina-local={paginaLocal} aria-busy={carregando}><table><tbody>{itens.map(item=><tr key={item.id} data-document-id={item.id}>{colunas.map(c=><td key={c.id}>{c.render?.(item)}</td>)}<td>{acoesLinha?.(item)}</td></tr>)}</tbody></table></div>;
export const FormSecao=({children})=><div>{children}</div>;
export const CampoForm=({children})=><div>{children}</div>;
export const CelulaDupla=({principal})=><span>{principal}</span>;
export const Avisos=()=>null;
export const useAvisos=()=>({avisos:[],avisar:{erro:()=>{},sucesso:()=>{},alerta:()=>{}},fechar:()=>{}});
export const useFiltrosVisiveis=()=>({ehVisivel:()=>true});
export const BarraFiltros=({busca})=><input aria-label='Busca fiscal' value={busca.valor} onChange={e=>busca.aoMudar(e.target.value)}/>;`;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Page from '/src/modules/fiscal/pages/FiscalDocuments.jsx';
window.qaObservers=[];window.IntersectionObserver=class{constructor(callback){this.callback=callback;this.active=true;window.qaObservers.push(this);}observe(){}disconnect(){this.active=false;}};
window.qaIntersect=()=>{for(const o of window.qaObservers)if(o.active)o.callback([{isIntersecting:true}]);};
createRoot(document.getElementById('root')).render(<MemoryRouter><Page/></MemoryRouter>);`;
const modules={'\0qa-fiscal-api.js':api,'\0qa-fiscal-layout.jsx':layout,'\0qa-fiscal-entry.jsx':entry,
 '\0qa-fiscal-viewer.js':'export default()=>({abrirPreview:()=>{},modalPreview:null});','\0qa-fiscal-status.jsx':"import React from 'react';export default({status})=><span>{status}</span>;"};
const vite=await createServer({root,configFile:false,envFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},css:{postcss:{plugins:[]}},
 plugins:[{name:'qa-fiscal-paginacao',enforce:'pre',resolveId(id,importer){
  if(id==='/qa-fiscal-paginacao.jsx')return '\0qa-fiscal-entry.jsx';
  if(!importer?.replaceAll('\\','/').includes('/modules/fiscal/'))return;
  if(id==='../services/fiscalApi')return '\0qa-fiscal-api.js';
  if(id==='../../../components/padrao')return '\0qa-fiscal-layout.jsx';
  if(id==='../../../hooks/useVisualizadorArquivo')return '\0qa-fiscal-viewer.js';
  if(id==='../../../components/StatusBadge')return '\0qa-fiscal-status.jsx';
 },load(id){if(Object.hasOwn(modules,id))return id.endsWith('.jsx')?transformWithEsbuild(modules[id],id,{loader:'jsx',jsx:'transform'}):modules[id];},configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.split('?')[0]!=='/qa-fiscal-paginacao')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-fiscal-paginacao','<html><body><div id="root"></div><script type="module" src="/qa-fiscal-paginacao.jsx"></script></body></html>'));
 });}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
 await vite.listen();const address=vite.httpServer.address(),origin=`http://127.0.0.1:${address.port}`;
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});const context=await browser.newContext({viewport:{width:1366,height:900}});
 const errors=[],external=[];await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('about:'))return route.continue();external.push(u);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const table=page.locator('[data-key="tabela:documentos-fiscais"]'),count=()=>table.locator('tr').count();
 const ready=()=>page.waitForFunction(()=>document.querySelector('[data-key="tabela:documentos-fiscais"]')?.getAttribute('aria-busy')==='false');
 await page.goto(origin+'/qa-fiscal-paginacao');await ready();
 assert.equal(await count(),50);assert.match(await page.locator('[data-total]').textContent(),/125/);
 assert.equal(await table.getAttribute('data-pagina-local'),'0');assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.qa.calls.length),1);
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await ready();assert.equal(await count(),50);
 assert.equal(await table.locator('tr').first().getAttribute('data-document-id'),'51');
 assert.equal(await page.evaluate(()=>window.qa.calls.at(-1).page),2);assert.equal(await page.evaluate(()=>window.qa.companies),1);
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await ready();assert.equal(await count(),25);
 assert(await page.getByRole('button',{name:'Próxima',exact:true}).isDisabled());
 await page.getByRole('button',{name:/Modo atual: paginação numerada/}).click();await ready();assert.equal(await count(),50);
 const before=await page.evaluate(()=>window.qa.calls.length);
 await page.evaluate(()=>{window.qa.slow=true;for(let i=0;i<6;i++)window.qaIntersect();});
 await ready();assert.equal(await count(),100);assert.equal(await page.evaluate(()=>window.qa.calls.length),before+1);
 await page.evaluate(()=>{window.qa.slow=false;window.qa.failNext=true;window.qaIntersect();});await ready();
 assert.equal(await count(),100);assert(await page.getByRole('alert').isVisible());
 const failedCalls=await page.evaluate(()=>window.qa.calls.length);await page.evaluate(()=>window.qaIntersect());await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.qa.calls.length),failedCalls);
 await page.getByRole('button',{name:'Tentar carregar novamente',exact:true}).first().click();await ready();assert.equal(await count(),125);
 assert.equal(await table.locator('tr[data-document-id="101"]').count(),1);
 await page.evaluate(()=>window.qaIntersect());await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.qa.calls.length),failedCalls+1);
 await page.getByRole('button',{name:/Modo atual: rolagem infinita/}).click();await ready();assert.equal(await count(),50);
 // Filtros sao rascunho ate Atualizar lista; resposta obsoleta nao substitui a nova.
 const callsBeforeDraft=await page.evaluate(()=>window.qa.calls.length);
 await page.getByRole('textbox',{name:'Busca fiscal'}).fill('80');assert.equal(await page.evaluate(()=>window.qa.calls.length),callsBeforeDraft);
 await page.evaluate(()=>window.qa.slow=true);await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
 await page.getByRole('textbox',{name:'Busca fiscal'}).fill('90');await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
 await ready();assert.equal(await count(),1);assert.equal(await table.locator('tr').getAttribute('data-document-id'),'90');assert.equal(await page.evaluate(()=>window.qa.maxInFlight),1);
 assert.equal(await page.evaluate(()=>window.qa.calls.at(-1).page),1);assert.match(await page.locator('[data-total]').textContent(),/1 documento/);
 assert.match(await table.getByRole('link',{name:'Detalhes'}).getAttribute('href'),/\/fiscal\/documentos\/90$/);
 const popupEvent=page.waitForEvent('popup');await table.getByRole('button',{name:'XML',exact:true}).click();const popup=await popupEvent;await popup.close();
 assert.deepEqual(await page.evaluate(()=>window.qa.files),[{id:90,type:'xml'}]);
 await page.evaluate(()=>window.qa.slow=false);await page.getByRole('button',{name:'Limpar',exact:true}).click();await ready();assert.equal(await count(),50);
 assert.equal(await page.evaluate(()=>window.qa.companies),1);assert.equal(await page.evaluate(()=>window.qa.mutations),0);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:/Modo atual: paginação numerada/}).click();await ready();await page.evaluate(()=>window.qaIntersect());await ready();assert.equal(await count(),100);
 const out=path.join(root,'../outputs/nsdocs-complemento-20261025');await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'fiscal-rolagem-mobile.png'),fullPage:false});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('UI fiscal aprovada: 125 documentos/3paginas, rolagem sob demanda, consultas concorrentes/filtros/erro/retry, empresas1x, XML/detalhes e mobile. Zero chamadas externas/mutacoes.');
}finally{await browser?.close();await vite.close();}
