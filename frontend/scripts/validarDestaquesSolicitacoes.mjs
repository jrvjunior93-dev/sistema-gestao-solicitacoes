import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from 'tailwindcss';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,'../outputs/destaques-solicitacoes-20261029');await fs.mkdir(out,{recursive:true});
const fixture=`import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,useLocation}from'react-router-dom';
import Lista from'/src/components/lista-avancada/ListaAvancada.jsx';
import Atividade,{urgenciaAtividade}from'/src/pages/Solicitacoes/AtividadePendente.jsx';
import Atencao from'/src/pages/Solicitacoes/AtencaoPendente.jsx';import Legenda from'/src/pages/Solicitacoes/LegendaDestaques.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/components/lista-avancada/lista-avancada.css';
const initial=[{id:101,codigo:'SOL-101',atividades_pendentes:[{tipo:'RETORNO_PENDENTE',nome:'Aprovar retorno',inicio_em:new Date(Date.now()-7200000).toISOString(),prazo_em:null,atrasada:false}],interacoes_pendentes:[{tipo:'COMENTARIO',quantidade:2,historico_id:1}]},
{id:102,codigo:'SOL-102',atividades_pendentes:[{tipo:'ENTREGA_PENDENTE',nome:'Informar entrega',prazo_em:'2026-10-28',atrasada:true}],interacoes_pendentes:[{tipo:'ANEXO',quantidade:1,historico_id:2}]},
{id:103,codigo:'SOL-103',atividades_pendentes:[],interacoes_pendentes:[{tipo:'COMENTARIO',quantidade:5,historico_id:3}]},
{id:104,codigo:'SOL-104',atividades_pendentes:[],interacoes_pendentes:[],acompanhamento_setor:'Compras',data_vencimento:'2020-01-01'}];
function App(){const[items,set]=useState(initial);const location=useLocation();useEffect(()=>{window.qa={read:id=>set(rows=>rows.map(r=>r.id===id?{...r,interacoes_pendentes:[],atencao_pendente:null}:r)),decide:id=>set(rows=>rows.map(r=>r.id===id?{...r,atividades_pendentes:[]}:r)),reset:()=>set(initial)}},[]);
const identity=r=><div style={{display:'flex',flexDirection:'column',gap:4,minWidth:0}}><strong>{r.codigo}</strong><Atividade solicitacao={r}/><Atencao solicitacao={r}/></div>;
return <main style={{padding:16,background:'var(--ui-surface)',color:'var(--app-body-color)',minHeight:'100vh'}}><h1 style={{fontSize:20,fontWeight:700}}>Solicitações · validação dos destaques</h1><Legenda/>
<Lista id="qa-destaques" itens={items} total={items.length} carregando={false} onQueryChange={()=>{}} colunas={[{id:'codigo',titulo:'Código / atividade',principal:true,larguraPadrao:480,render:identity},{id:'descricao',titulo:'Descrição',render:r=>r.id===101?'Solicitação aguardando decisão do setor':'Registro de validação'}]} renderCard={identity} urgencia={urgenciaAtividade} aoAbrirItem={()=>window.rowClicks=(window.rowClicks||0)+1}/><div id="qa-rota">{location.pathname+location.search}</div></main>};createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`;
const server=await createServer({root,configFile:false,logLevel:'error',css:{postcss:{plugins:[tailwind({config:path.join(root,'tailwind.config.js')})]}},server:{host:'127.0.0.1',port:0},plugins:[{
 name:'destaques-fixture',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return'\0destaques.jsx';},
 async load(id){if(id==='\0destaques.jsx')return transformWithEsbuild(fixture,'destaques.jsx',{loader:'jsx',jsx:'transform'});},
 transform(code,id){if(id.endsWith('/src/services/api.js'))return code.replace('export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);',"export const API_URL = 'https://fixture.invalid/api';");},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]==='/fixture'){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));}else next();});}
},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],external=[];
try{
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/Sao_Paulo'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base))return route.continue();if(url.startsWith('https://fixture.invalid/api/listas/'))return route.fulfill({json:url.includes('/preferencias')?{preferencias:{}}:{filtros:[]}});external.push(url);return route.abort();});
  await page.goto(base+'/fixture');await page.getByRole('button',{name:'Interações não lidas de SOL-101: 2',exact:true}).waitFor();
  const row=id=>page.locator(width===1366?'.la-linha':'.la-card').filter({hasText:'SOL-'+id});
  assert.ok((await row(101).getAttribute('class')).includes('atividade-pendente'));
  assert.ok((await row(102).getAttribute('class')).includes('atividade-atrasada'));
  assert.ok(!(await row(103).getAttribute('class')).includes('atividade-'));
  assert.ok(!(await row(104).getAttribute('class')).includes('atividade-'));
  assert.ok((await row(101).innerText()).includes('sem prazo definido'));
  assert.ok((await row(101).innerText()).includes('aguardando há 2 h'));
  assert.ok((await row(102).innerText()).includes('28/10/2026'),'DATE nao retrocede com fuso local');
  await page.locator('.sol-legenda summary').click();assert(await page.getByText(/Ler remove apenas esse marcador/).isVisible());
  for(const dark of [false,true]){
   await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
   await page.waitForFunction(()=>{const s=document.createElement('span');s.style.color='var(--sem-info)';document.body.append(s);const expected=getComputedStyle(s).color;s.remove();return getComputedStyle(document.querySelector('.sol-interacoes-nao-lidas')).color===expected;});
   const colors=await page.evaluate(()=>{const token=name=>{const s=document.createElement('span');s.style.color='var('+name+')';document.body.append(s);const c=getComputedStyle(s).color;s.remove();return c;};return{unread:getComputedStyle(document.querySelector('.sol-interacoes-nao-lidas')).color,info:token('--sem-info'),pending:getComputedStyle(document.querySelector('.sol-atividade')).color,warning:token('--sem-warning'),width:document.documentElement.scrollWidth,viewport:innerWidth};});
   assert.equal(colors.unread,colors.info);assert.equal(colors.pending,colors.warning);
   if(width===390)assert.ok(colors.width<=colors.viewport,'sem rolagem horizontal no celular');
   await page.screenshot({path:path.join(out,'lista-'+width+(dark?'-escuro':'-claro')+'.png'),fullPage:true});
  }
  await page.getByRole('button',{name:'Interações não lidas de SOL-101: 2',exact:true}).click();assert.equal(await page.evaluate(()=>window.rowClicks||0),0);
  const dialog=page.getByRole('dialog',{name:'Interações · SOL-101'});assert.equal(await dialog.getByRole('link').count(),1);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.evaluate(()=>window.qa.read(101));await page.getByRole('button',{name:'Interações não lidas de SOL-101: 2',exact:true}).waitFor({state:'hidden'});
  assert.ok((await row(101).getAttribute('class')).includes('atividade-pendente'));
  await page.evaluate(()=>{window.qa.reset();window.qa.decide(101);});await page.getByRole('button',{name:'Interações não lidas de SOL-101: 2',exact:true}).waitFor();
  await page.waitForFunction(()=>![...document.querySelectorAll('.la-linha,.la-card')].find(r=>r.textContent.includes('SOL-101')).className.includes('atividade-'));
  await page.evaluate(()=>window.qa.reset());await row(101).getByRole('link',{name:/Aprovar retorno/}).click();
  await page.waitForFunction(()=>document.getElementById('qa-rota').textContent.includes('interacao=RETORNO_PENDENTE'));
  assert.equal(await page.evaluate(()=>window.rowClicks||0),0);
  await row(101).getByRole('link',{name:/Aprovar retorno/}).press('Enter');
  assert.equal(await page.evaluate(()=>window.rowClicks||0),0,'Enter no atalho nao dispara abertura da linha');await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('OK: ListaAvancada/componentes reais, desktop/mobile, claro/escuro, legenda, leitura independente, decisao, atalho e fuso; APIs ficticias sem rede externa.');
}finally{await browser.close();await server.close();}
