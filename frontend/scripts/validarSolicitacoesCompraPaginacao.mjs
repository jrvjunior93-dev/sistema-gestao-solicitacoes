// Tela/hook/servico reais; React em navegador com dados ficticios e fetch isolado.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const layout=`import React,{useMemo,useState} from 'react';
export{default as Paginacao}from'/src/components/padrao/Paginacao.jsx';
export const Pagina=({children})=><main>{children}</main>;
export const PageHeader=({titulo,contagem,acaoPrincipal,secundarias=[],destrutiva})=><header><h1>{titulo}</h1><span data-total>{contagem}</span>{[acaoPrincipal,...secundarias,destrutiva].filter(Boolean).map(b=><button key={b.rotulo} onClick={b.onClick} disabled={b.desabilitada}>{b.rotulo}</button>)}</header>;
export const BlocoConteudo=({children,titulo,descricao})=><section><h2>{titulo}</h2><p>{descricao}</p>{children}</section>;
export const CelulaDupla=({principal,sub})=><span>{principal} {sub}</span>;
export const TabelaPadrao=({colunas,itens=[],acoesLinha,carregando,selecao,paginaLocal})=><div data-table data-local-page={paginaLocal} aria-busy={carregando}><input type='checkbox' aria-label='Selecionar pagina' checked={itens.length>0&&itens.every(r=>selecao?.selecionados.includes(r.id))} onChange={e=>selecao?.aoAlternarTodos(e.target.checked,itens.map(r=>r.id))}/><table><tbody>{itens.map(r=><tr key={r.id} data-id={r.id}><td><input aria-label={'Selecionar '+r.id} type='checkbox' checked={selecao?.selecionados.includes(r.id)||false} onChange={()=>selecao?.aoAlternar(r.id)}/></td>{colunas.map(c=><td key={c.id}>{c.render(r)}</td>)}<td>{acoesLinha(r)}</td></tr>)}</tbody></table></div>;
export const BarraFiltros=({busca,filtros,ativos,aoAlternar,aoLimpar})=><div><input aria-label='Busca' value={busca.valor} onChange={e=>busca.aoMudar(e.target.value)}/>{filtros.map(f=><div key={f.id}>{f.opcoes.map(o=><label key={o.valor}><input type='checkbox' aria-label={f.id+':'+o.valor} checked={ativos[f.id]?.has(o.valor)||false} onChange={()=>aoAlternar(f.id,o.valor,f.opcoes)}/>{o.rotulo}</label>)}</div>)}<button onClick={aoLimpar}>Limpar filtros</button></div>;
export const alternarValorFiltro=(state,key,value)=>{const set=new Set(state[key]);if(set.has(value))set.delete(value);else{if(key==='obra_id')set.clear();set.add(value);}return{...state,[key]:set};};
export const useFiltrosVisiveis=()=>({ehVisivel:()=>true});
export const Avisos=({avisos})=><div>{avisos.map((a,i)=><div role='alert' key={i}>{a}</div>)}</div>;
export function useAvisos(){const[avisos,set]=useState([]);const avisar=useMemo(()=>({erro:m=>set([m]),alerta:m=>set([m]),sucesso:m=>set([m])}),[]);return{avisos,avisar,fechar:()=>set([])};}
export const useConfirmacao=()=>({confirmar:async()=>{window.qa.confirmations++;if(window.qa.holdConfirmation)return new Promise(r=>{window.qa.confirmResolve=r;});return{ok:true};},elementoConfirmacao:null});`;
const entry=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Page from'/src/modules/solicitacao-compra/pages/SolicitacoesCompra.jsx';import{obterSolicitacaoCompra}from'/src/services/compras.js';
window.qa={calls:[],active:0,maxActive:0,aborted:0,delay:15,fail:false,legacy:false,opened:[],pdf:[],mutations:[],confirmations:0,holdConfirmation:false,obras:0,permissions:true};
const rows=Array.from({length:125},(_,i)=>{const id=125-i;return{id,origem:'NORMAL',status:id%3===0?'CANCELADA':'PENDENTE',obra_id:id%2+1,obra:{id:id%2+1,nome:id%2?'Obra Norte':'Obra Sul',codigo:id%2?'OB1':'OB2'},solicitante:{nome:'Ana'},itens_count:63,fornecedores_count:2,createdAt:'2026-10-27'};});
window.fetch=(url,options={})=>{
 const p=new URL(url,location.origin);if(!p.pathname.startsWith('/__qa_api/'))throw Error('REDE_FORA_DA_FIXTURE');const query=Object.fromEntries(p.searchParams),method=options.method||'GET';window.qa.calls.push({path:p.pathname,query,method});
 if(method!=='GET'){window.qa.mutations.push({path:p.pathname,method,body:options.body});return Promise.resolve(new Response('{}',{status:200}));}
 if(p.pathname.endsWith('/pdf')){window.qa.pdf.push(p.pathname);return Promise.resolve(new Response(new Blob(['PDF ficticio']),{status:200}));}
 const detail=p.pathname.match(/solicitacoes\\/(\\d+)$/);if(detail)return Promise.resolve(new Response(JSON.stringify({id:Number(detail[1]),itens:[]}),{status:200}));
 return new Promise((resolve,reject)=>{window.qa.active++;window.qa.maxActive=Math.max(window.qa.maxActive,window.qa.active);let done=false;
  const timer=setTimeout(()=>{if(done)return;done=true;window.qa.active--;if(window.qa.fail){window.qa.fail=false;resolve(new Response('{"error":"Falha ficticia"}',{status:503}));return;}if(window.qa.legacy){resolve(new Response('[]',{status:200}));return;}
   const canonical=s=>s==='CANCELADA'?'CANCELADO':s;const statuses=(query.status||'').split(',').filter(Boolean),q=(query.q||'').toLowerCase();
   const filtered=rows.filter(r=>(!query.obra_id||String(r.obra_id)===query.obra_id)&&(!statuses.length||statuses.includes(canonical(r.status)))&&(!q||['sc-'+String(r.id).padStart(5,'0'),r.obra.nome,r.obra.codigo,r.solicitante.nome].some(s=>s.toLowerCase().includes(q))));
   const limit=Number(query.limit),pages=Math.max(1,Math.ceil(filtered.length/limit)),page=Math.min(Number(query.page),pages);
   resolve(new Response(JSON.stringify({data:filtered.slice((page-1)*limit,page*limit),pagination:{page,limit,total:filtered.length,pages},filters:{statuses:['PENDENTE','CANCELADA']}}),{status:200}));
  },window.qa.delay);
  options.signal?.addEventListener('abort',()=>{if(done)return;done=true;window.qa.active--;window.qa.aborted++;clearTimeout(timer);reject(new DOMException('Cancelado','AbortError'));},{once:true});
 });
};
function App(){const[id,setId]=useState(null);useEffect(()=>{const fn=e=>{window.qa.opened.push(e.detail);setId(Number(e.detail.split('/').at(-1)));};window.addEventListener('qa-open',fn);return()=>window.removeEventListener('qa-open',fn);},[]);useEffect(()=>{if(id)obterSolicitacaoCompra(id);},[id]);return <Page/>;}
const app=createRoot(document.getElementById('root'));window.qa.unmount=()=>app.unmount();app.render(<MemoryRouter><App/></MemoryRouter>);`;
const modules={
 '\0qa-sc-entry.jsx':entry,'\0qa-sc-layout.jsx':layout,
 '\0qa-sc-api.js':`export const API_URL='/__qa_api';export const authHeaders=()=>({'X-QA':'fixture'});export const fileUrl=u=>u;`,
 '\0qa-sc-obras.js':`export const getMinhasObras=async()=>{window.qa.obras++;return[{id:1,nome:'Norte'},{id:2,nome:'Sul'}];};`,
 '\0qa-sc-auth.js':`export const useAuth=()=>({user:{id:7}});`,
 '\0qa-sc-workspace.js':`import{useState}from'react';export const useWorkspaceState=(_key,value)=>useState(value);export const useWorkspaceWork=()=>{};`,
 '\0qa-sc-open.js':`export default()=>path=>window.dispatchEvent(new CustomEvent('qa-open',{detail:path}));`,
 '\0qa-sc-acesso.js':`export const canDeleteCompraSolicitacoes=()=>window.qa.permissions;export const canEncaminharCompraSolicitacoes=()=>window.qa.permissions;export const isBusinessAdmin=()=>false;`,
 '\0qa-sc-setor.js':`export const userHasSetorCapability=(_u,k)=>k==='eh_setor_geo';`,
 '\0qa-sc-live.js':`import{useEffect}from'react';export default fn=>useEffect(()=>{window.qa.refresh=fn;},[fn]);`,
 '\0qa-sc-viewer.js':`export default()=>({abrirPreview:async fn=>fn(),modalPreview:null});`,
 '\0qa-sc-badge.jsx':`import React from'react';export default({status})=><span>{status}</span>;`
};
const vite=await createServer({root,configFile:false,envFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},css:{postcss:{plugins:[]}},
 plugins:[{name:'qa-sc-paginacao',enforce:'pre',resolveId(id,importer){
  if(id==='/qa-sc.jsx')return'\0qa-sc-entry.jsx';const from=importer?.replaceAll('\\','/')||'';
  if(from.includes('/services/')&&id==='./api')return'\0qa-sc-api.js';
  if(!from.includes('/modules/solicitacao-compra/'))return;
  const aliases={'../../../components/padrao':'\0qa-sc-layout.jsx','../../../services/obras':'\0qa-sc-obras.js','../../../contexts/AuthContext':'\0qa-sc-auth.js','../../../navigation/WorkspaceContext':'\0qa-sc-workspace.js','../../../navigation/useWorkspaceOpenRecord':'\0qa-sc-open.js','../../../utils/acessoProduto':'\0qa-sc-acesso.js','../../../utils/setor':'\0qa-sc-setor.js','../hooks/useComprasRealtimeRefresh':'\0qa-sc-live.js','../../../hooks/useVisualizadorArquivo':'\0qa-sc-viewer.js','../../../components/StatusBadge':'\0qa-sc-badge.jsx'};
  return aliases[id];
 },load(id){if(Object.hasOwn(modules,id))return id.endsWith('.jsx')?transformWithEsbuild(modules[id],id,{loader:'jsx',jsx:'transform'}):modules[id];},configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/qa-sc')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-sc','<html><body><div id="root"></div><script type="module" src="/qa-sc.jsx"></script></body></html>'));});}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
 await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});const context=await browser.newContext({viewport:{width:1366,height:900}}),external=[],errors=[];
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('about:'))return route.continue();external.push(u);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const table=page.locator('[data-table]'),ready=()=>page.waitForFunction(()=>document.querySelector('[data-table]')?.getAttribute('aria-busy')==='false'),firstId=()=>table.locator('tr').first().getAttribute('data-id');
 await page.goto(origin+'/qa-sc');await ready();assert.equal(await table.locator('tr').count(),50);assert.equal(await firstId(),'125');assert.equal(await table.getAttribute('data-local-page'),'0');assert.match(await page.locator('[data-total]').textContent(),/125/);assert.equal(await page.evaluate(()=>window.qa.calls.length),1);assert.equal(await page.evaluate(()=>window.qa.obras),1);
 await page.getByRole('checkbox',{name:'Selecionar pagina',exact:true}).check();assert(await page.getByRole('button',{name:'Inativar selecionadas (50)',exact:true}).isVisible());
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await ready();assert.equal(await firstId(),'75');assert.equal(await page.getByRole('button',{name:/Inativar selecionadas/}).count(),0);assert.equal(await page.evaluate(()=>window.qa.calls.at(-1).query.page),'2');
 await page.getByRole('textbox',{name:'Busca',exact:true}).fill('sc-00001');await ready();assert.equal(await firstId(),'1');assert.match(await page.locator('[data-total]').textContent(),/1 solicitacao/);assert.equal(await page.evaluate(()=>window.qa.calls.at(-1).query.page),'1');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await ready();await page.getByRole('checkbox',{name:'status:CANCELADO',exact:true}).check();await ready();assert.equal(await table.locator('tr').count(),41);assert.equal(await page.evaluate(()=>window.qa.calls.at(-1).query.status),'CANCELADO');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Abrir detalhes da solicitação SC-00125',exact:true}).click();await page.waitForFunction(()=>window.qa.calls.some(c=>c.path.endsWith('/solicitacoes/125')));assert.equal(await page.evaluate(()=>window.qa.calls.filter(c=>/solicitacoes\/\d+$/.test(c.path)).length),1);
 // Uma confirmacao antiga deve perder validade ao trocar de pagina.
 await page.evaluate(()=>window.qa.holdConfirmation=true);await page.getByRole('checkbox',{name:'Selecionar 125',exact:true}).check();await page.getByRole('button',{name:'Inativar selecionadas (1)',exact:true}).click();await page.waitForFunction(()=>!!window.qa.confirmResolve);
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await ready();await page.evaluate(()=>{window.qa.confirmResolve({ok:true});window.qa.holdConfirmation=false;});assert.equal(await page.evaluate(()=>window.qa.mutations.length),0);
 // Multiplos refreshs enquanto ha uma carga ativa sao coalescidos.
 await page.evaluate(()=>{window.qa.delay=300;for(let i=0;i<6;i++)window.qa.refresh();});await ready();assert.equal(await page.evaluate(()=>window.qa.maxActive),1);
 // Resposta antiga/abortada nao reaparece apos mudar filtro.
 await page.getByRole('textbox',{name:'Busca',exact:true}).fill('sc-00070');await page.waitForFunction(()=>window.qa.active===1);await page.getByRole('textbox',{name:'Busca',exact:true}).fill('sc-00080');await ready();assert.equal(await firstId(),'80');assert.equal(await page.evaluate(()=>window.qa.maxActive),1);
 await page.evaluate(()=>{window.qa.delay=10;window.qa.fail=true;window.qa.refresh();});await ready();assert.equal(await table.locator('tr').count(),0);assert(await page.getByRole('alert').isVisible());
 await page.evaluate(()=>{window.qa.legacy=true;window.qa.refresh();});await ready();assert.match(await page.getByRole('alert').textContent(),/consulta paginada esta indisponivel/);assert.equal(await table.locator('tr').count(),0);
 await page.evaluate(()=>{window.qa.legacy=false;window.qa.refresh();});await ready();assert.equal(await firstId(),'80');
 await page.evaluate(()=>{window.qa.permissions=false;window.qa.refresh();});await ready();assert.equal(await page.getByRole('button',{name:'Inativar solicitação',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Enviar solicitação SC-00080 para Compras',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Abrir detalhes da solicitação SC-00080',exact:true}).count(),1);
 await page.setViewportSize({width:390,height:844});assert(await table.isVisible());await page.screenshot({path:path.join(root,'../outputs/compras-paginacao-mobile.png'),fullPage:true});
 await page.evaluate(()=>{window.qa.delay=400;window.qa.refresh();});await page.waitForFunction(()=>window.qa.active===1);await page.evaluate(()=>window.qa.unmount());assert.equal(await page.evaluate(()=>window.qa.active),0);
 assert.equal(await page.evaluate(()=>window.qa.mutations.length),0);assert.equal(await page.evaluate(()=>window.qa.obras),1);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('QA UI Compras: tela/hook/servico reais; paginas/filtros/contagem, detalhe sob demanda, selecao por pagina, confirmacao obsoleta, cancelamento/coalescencia, erro e contrato legado; sem API/banco externo.');
}finally{await browser?.close();await vite.close();}
