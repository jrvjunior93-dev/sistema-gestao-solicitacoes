// AuthProvider, seletor e LiveUpdates reais, servicos isolados em Vite/Chrome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `
import React,{useEffect,useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AuthProvider,useAuth} from '/src/contexts/AuthContext.jsx';
import {LiveUpdatesProvider,useLiveUpdateSubscription} from '/src/contexts/LiveUpdatesContext.jsx';
import DevUserSwitcher from '/src/components/DevUserSwitcher.jsx';
import {createWorkspaceMemory} from '/src/navigation/WorkspaceContext.jsx';
import {workspaceAccessIdentity} from '/src/navigation/workspaceModel.js';
window.qaSources=[];window.qaEvents=[];window.qaAssumes=0;window.qaFailure=false;
window.qaActor={id:1,nome:'Ator QA',perfil:'SUPERADMIN',dev_user_switch_enabled:true,token_version:3};
window.qaUsers=[{id:2,nome:'Usuario QA',perfil:'USUARIO',token_version:4,areas_permissoes:['minhas']},
{id:5,nome:'Compras QA',perfil:'COMPRAS',token_version:1,areas_permissoes:['compras']}];
window.qaState=id=>id===1?{enabled:true,production:true,users:window.qaUsers,current_user_id:1,actor:window.qaActor}:
{enabled:true,production:true,impersonating:true,actor:window.qaActor,users:window.qaUsers,current_user_id:id};
window.qaSession=id=>({token:'qa-'+id,user:id===1?window.qaActor:window.qaUsers.find(u=>u.id===id),dev_user_switch:window.qaState(id)});
window.qaCurrent=1;
window.qaAssume=async id=>{window.qaAssumes++;if(window.qaFailure)throw Error('Troca recusada QA');window.qaCurrent=id;return window.qaSession(id)};
window.EventSource=class{constructor(url,options){this.url=url;this.options=options;this.callbacks={};this.closed=false;
window.qaSources.push(this);setTimeout(()=>this.callbacks.connected?.({}),10)}
addEventListener(n,fn){this.callbacks[n]=fn;if(n==='fluxy.realtime')this.saved=fn}removeEventListener(n){delete this.callbacks[n]}
close(){this.closed=true}emit(){this.saved?.({data:JSON.stringify({identity:window.qaCurrent})})}};
function View(){const a=useAuth();const[,render]=useState(0);const scope=workspaceAccessIdentity(a.user);
const memory=useMemo(()=>createWorkspaceMemory(),[scope]);
useLiveUpdateSubscription({onEvent:e=>window.qaEvents.push(e)});
window.qaAuth=a;window.qaMemory=memory;
return <><DevUserSwitcher/><output data-id={a.user?.id} id="identity">{a.user?.perfil}</output>
<input aria-label="Rascunho" key={scope} defaultValue="" onChange={e=>memory.set('draft',e.target.value)}/></>}
createRoot(document.getElementById('root')).render(<MemoryRouter><AuthProvider><LiveUpdatesProvider><View/></LiveUpdatesProvider></AuthProvider></MemoryRouter>);
`;
const mocks = {
  'auth.js': `export const getCurrentSession=async()=>window.qaSession(window.qaCurrent);
export const getDevUserSwitchStatus=async()=>window.qaState(window.qaCurrent);
export const assumeDevUserRequest=id=>window.qaAssume(id);
export const restoreDevUserRequest=async()=>{window.qaCurrent=1;return window.qaSession(1)};
export const logoutRequest=async()=>({});`,
  'configuracoesSistema.js': `export const enviarHeartbeatSessao=async()=>({});export const getModulosSistema=async()=>({});export const getTimeoutInatividade=async()=>({minutos:20});`,
  'api.js': `export const API_URL='/api';export const getAuthToken=()=>window.qaToken||null;export const setAuthToken=t=>{window.qaToken=t};export const clearAuthToken=()=>{window.qaToken=null};`
};
// A tela real descarta memoria e desmonta os Outlets por identidade/permissoes.
const layout=readFileSync(path.join(root,'src/layout/Layout.jsx'),'utf8');
assert.match(layout,/createWorkspaceMemory\(\), \[accessIdentity\]/);
assert.match(layout,/<WorkspaceView key=\{accessIdentity\}/);
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0},
  plugins:[{name:'qa-troca-isolamento',
    resolveId(id){if(id==='/qa-switch.jsx')return '\0qa-switch.jsx';},
    load(id){if(id==='\0qa-switch.jsx')return transformWithEsbuild(fixture,'qa-switch.jsx',{loader:'jsx',jsx:'transform'});},
    transform(code,id){for(const[name,mock]of Object.entries(mocks))if(id.endsWith('/src/services/'+name))return mock;},
    configureServer(s){s.middlewares.use(async(req,res,next)=>{
      if(new URL(req.url,'http://localhost').pathname!=='/qa-switch')return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/qa-switch',
        '<html><body><div id="root"></div><script type="module" src="/qa-switch.jsx"></script></body></html>'));
    });}
  },react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [1366,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa-switch');
    await page.getByRole('button',{name:'Trocar usuário',exact:true}).click();
    assert.equal(await page.getByText('Produção · ações reais',{exact:true}).count(),1);
    await page.getByLabel('Rascunho').fill('Dado reservado do ator');
    await page.evaluate(()=>{window.qaFailure=true});
    await page.getByRole('menuitem',{name:/Usuario QA/i}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('#identity').getAttribute('data-id'),'1');
    assert.equal(await page.getByLabel('Rascunho').inputValue(),'Dado reservado do ator');
    await page.evaluate(()=>{window.qaFailure=false});
    await page.getByRole('menuitem',{name:/Usuario QA/i}).click();
    await page.waitForFunction(()=>document.querySelector('#identity').dataset.id==='2' && window.qaSources.length===2);
    assert.equal(await page.getByLabel('Rascunho').inputValue(),'');
    assert.equal(await page.evaluate(()=>window.qaMemory.get('draft')||null),null);
    assert.equal(await page.evaluate(()=>window.qaSources[0].closed),true);
    await page.evaluate(()=>{window.qaSources[0].emit();window.qaSources[1].emit()});
    assert.equal(await page.evaluate(()=>window.qaEvents.length),1,'Evento da conexao antiga descartado');
    assert.deepEqual(await page.evaluate(()=>window.qaAuth.user.areas_permissoes),['minhas']);
    await page.getByRole('button',{name:/Testando:/}).click();
    assert.equal(await page.getByRole('link',{name:'Configurar usuários'}).count(),0);
    await page.getByRole('menuitem',{name:/Compras QA/i}).click();
    await page.waitForFunction(()=>document.querySelector('#identity').dataset.id==='5' && window.qaSources.length===3);
    await page.getByRole('button',{name:/Testando:/}).click();
    await page.getByRole('button',{name:'Voltar ao SUPERADMIN'}).click();
    await page.waitForFunction(()=>document.querySelector('#identity').dataset.id==='1' && window.qaSources.length===4);
    assert.equal(await page.evaluate(()=>window.qaSources.slice(0,-1).every(s=>s.closed)),true);
    await page.evaluate(()=>window.qaAuth.login({...window.qaSession(2),dev_user_switch:{enabled:false}}));
    await page.waitForFunction(()=>document.querySelector('#identity').dataset.id==='2' && window.qaSources.length===5);
    assert.equal(await page.getByRole('button',{name:/Trocar usuário|Testando:/}).count(),0,'Usuario legitimo comum nao ve seletor');
    await page.evaluate(()=>window.qaAuth.logout());
    await page.waitForFunction(()=>window.qaSources.at(-1).closed);
    assert.deepEqual(errors,[]);
    console.log('OK '+width+'px: AuthProvider real, producao/acoes reais, falha sem troca, identidade/rascunho/SSE isolados, troca/retorno/logout e seletor oculto ao usuario comum.');
    await page.close();
  }
}finally{await browser.close();await server.close();}
