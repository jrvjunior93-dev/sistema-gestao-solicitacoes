import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await createServer({root,cacheDir:path.join(root,'../outputs/comprovantes-qa-cache'),
  css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:[path.join(root,'src/**/*.{js,jsx,ts,tsx}')]}),autoprefixer()]}},
  server:{host:'127.0.0.1',port:5327,strictPort:true,proxy:{}},plugins:[{name:'qa-comprovantes',transform(code,id){if(id.endsWith('/src/services/api.js'))return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)',"'/qa-api'");},configureServer(server){
    server.middlewares.use('/qa',async(_,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from'react';import{createRoot}from'react-dom/client';import Receipts from'/src/components/financeiro/ComprovantesTituloSolicitacao.jsx';
      import{getComprovanteCompartilhadoSolicitacao}from'/src/services/financeiro.js';
      import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';
      window.__opens=[];window.__sharedDone=false;const title={filaPagamentosManuais:[{id:9,status:'BAIXADO',comprovante_hash:'one',comprovante_nome:'legado.pdf',comprovantes:[{id:10,hash:'one',nome:'SOL-6278.pdf'},{id:11,hash:'two',nome:'adicional.pdf'}]}],comprovantesSolicitacao:[{id:30,nome_original:'SOL-6278-importado.pdf',caminho_arquivo:'isolado://importado'}]};
      createRoot(document.getElementById('root')).render(React.createElement('div',{style:{padding:'20px'}},React.createElement(Receipts,{titulo:title,onAbrir:(...args)=>window.__opens.push(args)}),React.createElement(Receipts,{titulo:{},onAbrir:()=>{}}),React.createElement(Receipts,{titulo:{somente_participacao:true,comprovantesCompartilhados:[{id:784,filaId:883,nome:'12333.pdf'}]},onAbrir:async(fila,id)=>{await getComprovanteCompartilhadoSolicitacao(6488,12604,fila,id);window.__sharedDone=true;}})));
      </script></body></html>`));});
  }}]});
await server.listen();let browser;
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const requests=[];await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:5327')return r.abort();if(u.pathname.startsWith('/qa-api/')){requests.push(u.pathname+u.search);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'isolado://assinado',nome:'12333.pdf'})});}return r.continue();});
  await page.goto('http://127.0.0.1:5327/qa');
  await page.getByRole('button',{name:'SOL-6278.pdf',exact:true}).click();
  await page.getByRole('button',{name:'adicional.pdf',exact:true}).click();
  await page.getByRole('button',{name:'Solicitação · SOL-6278-importado.pdf',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'legado.pdf',exact:true}).count(),0,'Principal repetido nao duplica');
  assert.equal(await page.getByText('Pendente',{exact:true}).count(),1);
  assert.deepEqual(await page.evaluate(()=>window.__opens),[[9,10,undefined,'SOL-6278.pdf'],[9,11,undefined,'adicional.pdf'],[undefined,'solicitacao-30','isolado://importado','SOL-6278-importado.pdf']]);
  await page.getByRole('button',{name:'12333.pdf',exact:true}).click();await page.waitForFunction(()=>window.__sharedDone);assert.deepEqual(requests,['/qa-api/solicitacoes/6488/titulos-financeiros/12604/comprovantes-fila/883?comprovante_id=784']);
  for(const width of[1366,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(root,`../outputs/comprovantes-titulo-${width}.png`)});}
  assert.deepEqual(errors,[]);console.log('OK: componente real da coluna, fila baixada principal/adicionais, deduplicacao, importacao identificada como solicitacao e argumentos do download. Sem APIs/banco.');
}finally{await browser?.close();await server.close();}
