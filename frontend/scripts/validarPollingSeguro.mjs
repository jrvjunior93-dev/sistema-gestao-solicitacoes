import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/hooks/usePollingSeguro.js'), 'utf8');
const timers = new Map(), eventos = new Map();
let now = 0, timerId = 0, calls = 0, active = 0, max = 0, finish;
const doc = { hidden: false, addEventListener: (n,f) => eventos.set('doc:'+n, f), removeEventListener: n => eventos.delete('doc:'+n) };
const win = { addEventListener: (n,f) => eventos.set(n, f), removeEventListener: n => eventos.delete(n) };
const mod = { exports: {} };
vm.runInNewContext(source.split('export default')[0].replace(/^import[^\n]+\n/, '').replace('export function', 'function') + '\nmodule.exports={iniciarPollingSeguro};', {
  module: mod, document: doc, window: win, Date: { now: () => now },
  setTimeout(fn, delay) { timers.set(++timerId, { fn, at: now+delay }); return timerId; }, clearTimeout: id => timers.delete(id)
});
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const advance = async ms => {
  now += ms;
  const ready = [...timers].filter(([,t]) => t.at <= now);
  for (const [id,t] of ready) { timers.delete(id); t.fn(); }
  await flush();
};
const stop = mod.exports.iniciarPollingSeguro(() => {
  calls++; active++; max=Math.max(max,active);
  return new Promise(ok => { finish = result => { active--; ok(result); }; });
}, { eventos: ['manual'] });
assert.equal(calls, 1);
for(let i=0;i<10;i++) eventos.get('focus')();
await advance(120000); assert.equal(calls, 1, 'Resposta lenta nao acumula consultas paralelas');
finish(true); await flush(); assert.equal(calls, 2, 'Eventos simultaneos coalescem em uma atualizacao');
finish(true); await flush(); await advance(29999); assert.equal(calls, 2);
await advance(1); assert.equal(calls, 3); finish(false); await flush();
await advance(30000); eventos.get('focus')(); await flush(); assert.equal(calls, 3, 'Foco nao ultrapassa backoff de erro');
await advance(30000); eventos.get('focus')(); await flush(); assert.equal(calls, 4);
finish(false); await flush(); assert([...timers.values()].every(t => t.at-now === 120000));
doc.hidden=true; await advance(120000); assert.equal(calls, 4);
doc.hidden=false; eventos.get('doc:visibilitychange')(); assert.equal(calls, 5);
stop(); finish(true); await flush(); await advance(999999);
assert.equal(calls, 5); assert.equal(max, 1); assert.equal(eventos.size, 0); assert.equal(timers.size, 0);

const server = await createServer({ root, server: { host: '127.0.0.1', port: 5327, strictPort: true }, plugins: [{
  name: 'qa-serial', configureServer(s) { s.middlewares.use(async (req,res,next) => {
    if (req.url !== '/qa-serial') return next();
    res.setHeader('Content-Type','text/html');
    res.end(await s.transformIndexHtml('/qa-serial', `<div id="root"></div><script type="module">
      import React,{useState,useEffect,useLayoutEffect}from'react';import{createRoot}from'react-dom/client';
      import serial from'/src/hooks/useConsultaSerial.js';import revision from'/src/navigation/useQueryRevision.js';
      window.calls=[];window.pending=[];window.active=0;window.max=0;
      function App(){const[id,setId]=useState('A'),[value,setValue]=useState('');const q=revision(id);
        const run=serial(async()=>{const token=q.begin();window.calls.push(id);window.active++;window.max=Math.max(window.max,window.active);
          await new Promise(ok=>window.pending.push(()=>{window.active--;ok()}));if(q.isCurrent(token))setValue(id);return id;},id);
        useLayoutEffect(()=>{window.api={setId,run}});
        useEffect(()=>{run()},[id,run]);return React.createElement('output',null,value);}
      const app=createRoot(document.getElementById('root'));window.unmount=()=>app.unmount();app.render(React.createElement(App));
    </script>`));
  }); }
}] });
await server.listen(); let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5327'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:5327/qa-serial');
  await page.waitForFunction(()=>window.calls?.length===1);
  assert(await page.evaluate(()=>window.api.run()===window.api.run()), 'Consultas iguais compartilham promessa');
  await page.evaluate(()=>window.api.setId('B'));await page.waitForFunction(()=>window.api&&document.querySelector('output'));
  await page.waitForTimeout(40);await page.evaluate(()=>window.api.setId('C'));await page.waitForTimeout(40);
  await page.evaluate(()=>window.pending.shift()());await page.waitForFunction(()=>window.calls.length===2);
  assert.deepEqual(await page.evaluate(()=>window.calls), ['A','C'], 'Filtro antigo nao dispara request e resposta obsoleta nao substitui recorte');
  await page.evaluate(()=>window.pending.shift()());await page.getByText('C',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.max),1);
  await page.evaluate(()=>{window.api.run();window.unmount()});await page.waitForTimeout(40);
  await page.evaluate(()=>window.pending.shift()?.());await page.waitForTimeout(40);
  assert.deepEqual(errors,[]);
  console.log('Polling/serial: resposta lenta, foco, backoff 60/120s, aba oculta, cleanup, deduplicacao e troca A/B/C com React real aprovados. Sem API externa.');
} finally { await browser?.close();await server.close(); }
