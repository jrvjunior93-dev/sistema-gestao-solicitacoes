// Sino, portal, Alert e HTTP reais. Sessao e transporte em memoria, sem banco/rede.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stub='\0qa-retorno-popup';
const plugin={name:'qa-retorno-popup',enforce:'pre',
  resolveId(source){if(source.endsWith('/contexts/AuthContext'))return stub;},
  load(id){if(id===stub)return `export const useAuth=()=>({user:{id:new URLSearchParams(location.search).get('user')||'99'}});`;},
  configureServer(server){server.middlewares.use('/qa-popup',async(_,res)=>{
    res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-popup',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,useLocation}from'react-router-dom';import Bell from '/src/components/NotificacoesBell.jsx';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';
function QA(){const loc=useLocation();return React.createElement(React.Fragment,null,React.createElement('header',{style:{display:'flex',justifyContent:'flex-end',padding:'12px'}},React.createElement(Bell)),React.createElement('p',{'data-route':true},loc.pathname))}createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(QA)));</script></body></html>`));})}
};
const server=await createServer({root,plugins:[plugin],server:{host:'127.0.0.1',port:5313,strictPort:true,proxy:{}}});await server.listen();let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],unexpected=[],marks=[],queries=[];
  page.on('pageerror',e=>errors.push(e.message));
  let popupFails=false;
  let rows=[{destinatario_id:11,tipo:'RETORNO_SOLICITADO',solicitacao_id:42,lida_em:null,mensagem:'Obra solicitou retorno de SOL-42.',metadata:{pedido_retorno_id:17}},
    {destinatario_id:12,tipo:'ANEXO_CRIADO',solicitacao_id:43,lida_em:null,mensagem:'Novo arquivo'}];
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.pathname.endsWith('/notificacoes')){
      const popup=url.searchParams.get('retornos_para_decisao')==='1';queries.push({popup,method:req.method()});
      if(popup&&popupFails)return json({error:'Falha QA'},503);
      return json({itens:popup?rows.filter(row=>row.tipo==='RETORNO_SOLICITADO'&&!row.lida_em):rows,total_nao_lidas:rows.filter(row=>!row.lida_em).length});
    }
    if(/\/notificacoes\/\d+\/lida$/.test(url.pathname)){
      const id=Number(url.pathname.match(/(\d+)\/lida$/)[1]);marks.push(id);rows=rows.map(row=>row.destinatario_id===id?{...row,lida_em:'2026-10-08'}:row);return route.fulfill({status:204});
    }
    if(url.origin==='http://127.0.0.1:5313'&&!url.pathname.startsWith('/api'))return route.continue();
    unexpected.push(url.pathname);return route.abort();
  });
  const popup=page.getByRole('alert').filter({hasText:'Pedido de retorno aguardando aprovação'});
  await page.goto('http://127.0.0.1:5313/qa-popup');await popup.waitFor();
  const bell=page.getByRole('button',{name:'Notificações',exact:true});
  assert((await popup.boundingBox()).y>(await bell.boundingBox()).y+(await bell.boundingBox()).height,'Popup abaixo do sino');
  await popup.getByRole('button',{name:'Fechar',exact:true}).click();await popup.waitFor({state:'hidden'});
  assert.equal(marks.length,0,'Dispensar popup nao marca notificacao como lida');
  await page.evaluate(()=>window.dispatchEvent(new Event('notificacoes:atualizar')));
  await page.reload();await bell.waitFor();assert.equal(await popup.count(),0,'Notificacao dispensada nao reaparece ao recarregar');
  await bell.click();await page.getByRole('dialog',{name:'Central de notificações'}).waitFor();
  assert.equal(await page.getByText('Obra solicitou retorno de SOL-42.',{exact:true}).count(),1,'Sino mantem pendencia');
  await page.getByRole('button',{name:'Fechar painel de notificações',exact:true}).click();
  rows.unshift({destinatario_id:15,tipo:'RETORNO_SOLICITADO',solicitacao_id:45,lida_em:null,mensagem:'GEO solicitou retorno de SOL-45.',metadata:{pedido_retorno_id:20}});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await popup.waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('notificacoes:atualizar')));
  assert.equal(await popup.count(),1,'Polling nao duplica popup');
  await popup.getByRole('button',{name:'Abrir solicitação',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.locator('[data-route]').filter({hasText:'/solicitacoes/45'}).waitFor();await popup.waitFor({state:'hidden'});
  assert.deepEqual(marks,[15],'Duplo clique abre/marca somente uma vez');
  rows.unshift({destinatario_id:18,tipo:'RETORNO_SOLICITADO',solicitacao_id:48,lida_em:null,mensagem:'DP solicitou retorno de SOL-48.',metadata:{pedido_retorno_id:21}});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await popup.waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const out=path.resolve(root,'../outputs/retorno-popup-20261008');await mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:path.join(out,'mobile-dark.png'),fullPage:true});
  // Aprovado/sem permissao: API nao retorna a pendencia e o aviso some.
  rows=rows.filter(row=>row.destinatario_id!==18);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await popup.waitFor({state:'hidden'});
  popupFails=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await bell.click();await page.getByRole('dialog',{name:'Central de notificações'}).waitFor();
  assert.equal(await popup.count(),0,'Falha do popup nao bloqueia o sino');
  assert(queries.some(q=>q.popup)&&queries.some(q=>!q.popup));assert(queries.every(q=>q.method==='GET'));
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('OK: popup abaixo do sino, retorno direcionado, dedupe/F5, dismiss sem leitura, abrir unico, polling/invalidacao, mobile/tema e sino independente. APIs simuladas.');
}finally{await browser?.close();await server.close();}
