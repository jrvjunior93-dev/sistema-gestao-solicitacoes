import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,'../outputs/rh-filtros-dp');fs.mkdirSync(out,{recursive:true});
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Pessoal from '/src/pages/RhDpPessoal.jsx';
import Transferencias from '/src/pages/RhDpTransferencias.jsx';
import Solicitacoes from '/src/pages/RhDpPessoalSolicitacoes.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';import '/src/styles/responsive-system.css';import '/src/components/lista-avancada/lista-avancada.css';
const q=new URLSearchParams(location.search),tela=q.get('tela');
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/rh-dp/pessoal?local_id=10&aba='+tela]}><div className="layout-shell"><main className="layout-main"><div className="rhdp-page rh-pessoal-page">{<Pessoal/>}</div></main></div></MemoryRouter>);`;
const server=await createServer({root,configFile:false,logLevel:'error',plugins:[{name:'fixture',enforce:'pre',
resolveId(id){if(id==='/fixture.jsx')return '\0rh-filtros';},
load(id){if(id==='\0rh-filtros')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'});},
transform(code,id){if(id.endsWith('/src/services/api.js'))return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)',"'/api'");
if(id.endsWith('/src/contexts/AuthContext.jsx'))return `import{createContext}from'react';const perfil=new URLSearchParams(location.search).get('perfil');const user={id:2,perfil,area:'DP',setor:{codigo:'DP'},areas_permissoes_configuradas:true,areas_permissoes:['rh_dp.documentos.visualizar','rh_dp.eventos_recorrentes.visualizar','rh_dp.colaboradores.visualizar','rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir','rh_dp.solicitacoes.decidir','rh_dp.solicitacoes.ver_todas'],modulos_habilitados:['RH_DP']};export const AuthContext=createContext({user});export const useAuth=()=>({user});`;},
configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/fixture?'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));});}
},react()],server:{host:'127.0.0.1',port:0}});
let browser;const errors=[];
try{
await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const base='http://127.0.0.1:'+server.httpServer.address().port;
for(const width of [1366,390])for(const perfil of ['USUARIO','SUPERADMIN'])for(const tela of ['transferencias','solicitacoes','documentos','eventos-recorrentes']){
const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));const calls=[];
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();calls.push(u.pathname+u.search);let value=[];
if(u.pathname.endsWith('/transferencias/configuracao'))value={obras:[{id:10,codigo:'10',nome:'Obra QA',tipo_centro_custo:'OBRA'},{id:20,codigo:'20',nome:'Destino QA',tipo_centro_custo:'OBRA'}],obras_responsavel_ids:[],obras_solicitacao_ids:[10,20],acesso_global:true,bypass_decisao:true};
else if(u.pathname.includes('/transferencias'))value={itens:Array.from({length:8},(_,i)=>({id:i+1,colaborador:{nome:'Pessoa QA '+i},obra_id:10,obra_destino_id:20,situacao:'ABERTA'})),total:8,pagina:1,total_paginas:1};
else if(u.pathname.endsWith('/solicitacoes'))value={itens:[],total:0,total_paginas:1,pagina:1,por_tipo:{},abertas:0,nao_lidas_abertas:0};
if(u.pathname==='/api/obras'||u.pathname==='/api/obras/minhas')value=[{id:10,codigo:'10',nome:'Obra QA',tipo_centro_custo:'OBRA'}];
await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});});
await page.goto(base+'/fixture?tela='+tela+'&perfil='+perfil);
if(tela==='transferencias')await page.getByRole('tab',{name:'Transferências deste local',exact:true}).click();
const buttons=page.locator('.la-filtro-btn');try{await buttons.first().waitFor();}catch(e){console.log('SEM FILTROS',perfil,tela,errors,(await page.locator('body').innerText()).slice(0,1700));throw e;}
const labels=await buttons.allTextContents();console.log(width,perfil,tela,labels);
for(let i=0;i<labels.length;i++){const b=buttons.nth(i);await b.click();await page.waitForTimeout(100);assert.equal(await b.getAttribute('aria-expanded'),'true',labels[i]);assert.equal(await page.getByRole('menu').count(),1);const menu=page.getByRole('menu');assert(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+20));}),'Menu coberto: '+perfil+' '+tela+' '+labels[i]);if(i===0){await page.evaluate(()=>{document.querySelector('main').style.paddingTop='30px';window.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(80);const diff=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),b=document.querySelector('.la-filtro-btn').getBoundingClientRect();return Math.min(Math.abs(r.top-b.bottom-4),Math.abs(b.top-r.bottom-4));});assert(diff<2,'Menu afastado da ancora: '+diff);}if(await menu.locator('input[type=checkbox],input[type=radio]').count()){const before=calls.length;await menu.locator('input[type=checkbox],input[type=radio]').first().click();await page.waitForTimeout(500);if(tela!=='eventos-recorrentes')assert(calls.length>before,'Selecao nao consultou API: '+tela);}await page.keyboard.press('Escape');}
await page.screenshot({path:path.join(out,width+'-'+perfil+'-'+tela+'.png')});await page.close();
}
assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();}
