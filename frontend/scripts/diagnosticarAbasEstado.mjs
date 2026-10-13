// Prova do comportamento ATUAL, nao teste de aceite da futura implementacao.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Outlet} from 'react-router-dom';
import {useLegacyWorkspaceTabs as useWorkspaceTabs} from '/src/navigation/useWorkspaceTabs';
const user={id:91377,perfil:'SUPERADMIN',setor:'GEO',areas_permissoes:{}};
function Form(){ const [value,set]=useState(''); return <input aria-label="Rascunho" value={value} onChange={e=>set(e.target.value)}/> }
function Shell(){ const w=useWorkspaceTabs(user); return <>
  <button onClick={()=>w.openTab('/compras/delegacao')}>Abrir consulta</button>
  <div data-tabs>{w.tabs.map(t=><button key={t.id} data-route={t.route} onClick={()=>w.activateTab(t.id)}>{t.title}</button>)}</div>
  <Outlet/>
</> }
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route element={<Shell/>}><Route path="/solicitacoes" element={<Form/>}/>
  <Route path="/compras/delegacao" element={<p>Consulta auxiliar</p>}/></Route>
</Routes></BrowserRouter>);
`;
let server; let browser;
try {
  server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'diagnostico-abas-sem-api',
    resolveId(id) { if (id === '/__diagnostico.jsx') return '\0diagnostico.jsx'; },
    async load(id) { if (id === '\0diagnostico.jsx') return transformWithEsbuild(fixture, 'diagnostico.jsx', {loader:'jsx',jsx:'transform'}); },
    configureServer(s) {
      s.middlewares.use(async (req,res,next)=>{
        if (req.url.split('?')[0] !== '/solicitacoes') return next();
        res.setHeader('Content-Type','text/html');
        res.end(await s.transformIndexHtml(req.url, '<div id="root"></div><script type="module" src="/__diagnostico.jsx"></script>'));
      });
    }
  },react()] });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}: {}) });
  for (const width of [1366,390]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/*', route=> {
      const url=new URL(route.request().url());
      return url.origin===origin ? route.continue() : route.abort();
    });
    await page.goto(origin+'/solicitacoes');
    try { await page.getByLabel('Rascunho').fill('Trabalho nao enviado 123'); }
    catch (error) { throw new Error(`Fixture nao iniciou: ${errors.join('; ') || error.message}`); }
    await page.getByRole('button',{name:'Abrir consulta',exact:true}).click();
    await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-tabs] button').count(),2);
    await page.locator('[data-route="/solicitacoes"]').click();
    await page.getByLabel('Rascunho').waitFor();
    assert.equal(await page.getByLabel('Rascunho').inputValue(),'','Base atual mudou: revisar diagnostico antes de implementar.');
    const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fluxy_workspace_tabs_v1:91377')));
    assert.equal(state.tabs.length,2);
    assert.deepEqual(Object.keys(state.tabs[0]).sort(),['id','preferredTitle','route','title']);
    assert.deepEqual(errors,[]);
    console.log(`CONFIRMADO ${width}px: hook real conserva duas abas, Outlet remonta formulario e perde campo local; storage guarda apenas metadados.`);
    await page.close();
  }
  console.log('Diagnostico isolado concluido. Nenhum endpoint, escrita de negocio, banco ou navegacao externa.');
} finally { await browser?.close(); await server?.close(); }
