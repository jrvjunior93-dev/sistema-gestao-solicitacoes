// DateInputBR real, sem servidor de negocio. Memoria separada por pagina/campo.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = `import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';
import DateInputBR from'/src/components/DateInputBR.jsx';import{WorkspacePageContext,createWorkspaceMemory,useWorkspaceState}from'/src/navigation/WorkspaceContext.jsx';
window.submits=0;function Form(){const[v,V]=useWorkspaceState('iso',{a:'',b:'',legacy:''});const[epoch,E]=useWorkspaceState('reset',0);window.reset=()=>{V({a:'',b:'',legacy:''});E(n=>n+1)};window.setISO=a=>V(s=>({...s,a}));window.iso=v;
return <form onSubmit={e=>{e.preventDefault();window.submits++}}>{['a','b','legacy'].map(k=><DateInputBR key={k} aria-label={k} name={k} value={v[k]} min='2026-01-01' max='2026-12-31' chaveWorkspace={k==='legacy'?undefined:k} revisaoWorkspace={epoch} onChange={e=>V(s=>({...s,[k]:e.target.value}))}/>)}<button>Enviar</button></form>}
function Host(){const[a,A]=useState(true);const[id,I]=useState('um');const m=useMemo(()=>createWorkspaceMemory(),[]);window.tab=A;window.record=I;window.memory=m;
return <WorkspacePageContext.Provider value={{key:id,memory:m,snapshot:true,active:true}}>{a?<Form key={id}/>:<p>Auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<Host/>);`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{
 name:'qa-data',resolveId:id=>id==='/fixture.jsx'?'\0qa-data.jsx':null,
 load:async id=>id==='\0qa-data.jsx'?transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'}):null,
 configureServer(v){v.middlewares.use(async(req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml('/','<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/fixture.jsx"></script></html>'))})}
},react()]});
let browser;const errors=[];
try{await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
const alternate=async()=>{await p.evaluate(()=>window.tab(false));await p.getByText('Auxiliar').waitFor();await p.evaluate(()=>window.tab(true));await p.getByLabel('a',{exact:true}).waitFor()};
for(const width of [1366,390]){await p.setViewportSize({width,height:900});await p.goto('http://127.0.0.1:'+server.httpServer.address().port);
const a=p.getByLabel('a',{exact:true});await a.fill('121');await p.getByLabel('b',{exact:true}).fill('31122026');await p.getByLabel('legacy').fill('141');await alternate();
assert.equal(await a.inputValue(),'12/1');assert.equal(await p.getByLabel('b',{exact:true}).inputValue(),'31/12/2026');assert.equal(await p.getByLabel('legacy').inputValue(),'');
assert.equal(await p.evaluate(()=>window.iso.a),'');assert.ok(!(await a.evaluate(e=>e.checkValidity())));await p.getByRole('button',{name:'Enviar'}).click();assert.equal(await p.evaluate(()=>window.submits),0);
await a.fill('31022026');await alternate();assert.equal(await a.inputValue(),'31/02/2026');assert.ok(!(await a.evaluate(e=>e.checkValidity())));
for(const val of ['31122025','01012027']){await a.fill(val);assert.ok(!(await a.evaluate(e=>e.checkValidity())))}
await a.fill('04102026');assert.equal(await p.evaluate(()=>window.iso.a),'2026-10-04');await alternate();assert.equal(await a.inputValue(),'04/10/2026');assert.ok(await a.evaluate(e=>e.checkValidity()));
await a.fill('12');await p.evaluate(()=>window.record('dois'));assert.equal(await a.inputValue(),'');await a.fill('23');await p.evaluate(()=>window.record('um'));assert.equal(await a.inputValue(),'12');
await p.evaluate(()=>window.reset());assert.equal(await a.inputValue(),'');await alternate();assert.equal(await a.inputValue(),'');
await a.fill('12');await p.evaluate(()=>window.setISO('2026-10-09'));await a.blur();await alternate();assert.equal(await a.inputValue(),'09/10/2026');
assert.equal(await p.evaluate(()=>window.submits),0);assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);
console.log('OK data '+width+'px: parcial/invalida, ISO, limites, isolamento, reset vazio, valor atual, legado e sem submit/storage.');}
assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close()}
