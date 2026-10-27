// Pagina e services reais. Todas as APIs sao interceptadas; sem EC2 ou banco.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'../outputs/ofx-natureza');fs.mkdirSync(output,{recursive:true});
const fixture=[
 "import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';",
 "import{AuthContext}from'/src/contexts/AuthContext.jsx';import Page from'/src/pages/FinanceiroConciliacao.jsx';",
 "import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';",
 "const readonly=new URLSearchParams(location.search).has('readonly');",
 "const user=readonly?{id:2,perfil:'OPERADOR',areas_permissoes_configuradas:true,areas_permissoes:['financeiro.conciliacao.visualizar']}:{id:1,perfil:'SUPERADMIN'};",
 "createRoot(document.getElementById('root')).render(<MemoryRouter><AuthContext.Provider value={{user}}><Page/></AuthContext.Provider></MemoryRouter>);"
].join('\n');
const server=await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(output,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{
 name:'ofx-natureza',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return '\0ofx-natureza.jsx';},
 load(id){if(id==='\0ofx-natureza.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'});},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://local').pathname!=='/fixture')return next();
  res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));});}
},react()]});
const rows=Array.from({length:180},(_,i)=>({id:i+1,status:i===169?'CONCILIADO':'PENDENTE',conta_bancaria_id:9,valor:i<110?-10:20,
 data_movimento:'2026-10-22',descricao_banco:(i<110?'SAIDA QA ':'ENTRADA QA ')+(i+1),conta_bancaria_nome:'Conta QA',
 sugestoes:[{movimento_financeiro_id:1000+i,titulo_financeiro_id:5000+i,titulo_codigo:'TIT-QA-'+i,tipo:i<110?'PAGAR':'RECEBER',valor_quitacao:i<110?10:20,data_movimento:'2026-10-22'}],
 conciliacao_em_lote_disponivel:true,associacao_manual_recomendada:false}));
rows.push({id:181,status:'PENDENTE',conta_bancaria_id:9,valor:0,data_movimento:'2026-10-22',descricao_banco:'ZERO QA',conta_bancaria_nome:'Conta QA',sugestoes:[]});
let browser,legacy=false;const errors=[],unexpected=[],reads=[],posts=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  const json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(req.method()!=='GET'){
   if(p.endsWith('/financeiro/conciliacoes/conciliar-sugeridos')){const body=req.postDataJSON();if(legacy)assert(!Object.hasOwn(body,'natureza'));posts.push(body);return json({resumo:{total_conciliadas:0}});}
   unexpected.push(req.method()+' '+p);return route.abort();
  }
  if(p.endsWith('/financeiro/contas-bancarias'))return json([{id:9,nome:'Conta QA',empresa_id:2,banco:'QA',ativo:true}]);
  if(p.endsWith('/financeiro/tarifas-bancarias-atalhos'))return json([]);
  if(p.endsWith('/financeiro/conciliacoes/importacoes'))return json({resumo:{total_lidos:181,total_importados:181},itens:[]});
  if(p.endsWith('/financeiro/conciliacoes')){
   const q=Object.fromEntries(url.searchParams);reads.push(q);
   if(legacy)assert(!Object.hasOwn(q,'natureza'),'Backend anterior nao aceita parametro novo');
   const filtered=rows.filter(r=>(!q.status||q.status==='TODOS'||r.status===q.status)&&(!q.conta_bancaria_id||r.conta_bancaria_id===Number(q.conta_bancaria_id))
    &&(!q.data_inicial||r.data_movimento>=q.data_inicial)&&(!q.data_final||r.data_movimento<=q.data_final)
    &&(q.natureza==='CREDITO'?r.valor>0:q.natureza==='DEBITO'?r.valor<0:true));
   const n=Number(q.page_size||100),pageIndex=Number(q.page||1);
   const resumo={total:filtered.length,pendentes:filtered.filter(r=>r.status==='PENDENTE').length,conciliados:filtered.filter(r=>r.status==='CONCILIADO').length,ignorados:0,
    valor_total:filtered.reduce((s,r)=>s+r.valor,0),valor_absoluto_total:filtered.reduce((s,r)=>s+Math.abs(r.valor),0)};
   return json({resumo,meta:{...(!legacy?{filtro_natureza_disponivel:true}:{}),total_listado:Math.min(n,Math.max(0,filtered.length-(pageIndex-1)*n)),total_disponivel:filtered.length,current_page:pageIndex,page_size:n,total_pages:Math.max(1,Math.ceil(filtered.length/n)),grupos_match:[]},
    itens:filtered.slice((pageIndex-1)*n,pageIndex*n)});
  }
  if(url.hostname==='127.0.0.1'&&!p.startsWith('/api'))return route.continue();
  unexpected.push(req.method()+' '+p);return route.abort();
 });
 const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
 const last=()=>reads.at(-1);
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:950});await page.goto(base);
  await page.getByRole('button',{name:'Conferir manualmente',exact:true}).click();
  const select=page.locator('label').filter({has:page.getByText('Movimentação',{exact:true})}).getByRole('combobox'),form=page.locator('form').filter({has:select});
  await page.getByText('SAIDA QA 1',{exact:true}).waitFor();assert.equal(await select.inputValue(),'TODOS');assert(!Object.hasOwn(last(),'natureza'));
  const before=reads.length;await select.selectOption('CREDITO');
  await page.getByText(/Recorte em rascunho: a lista abaixo ainda é/).waitFor();
  await page.waitForTimeout(200);assert.equal(reads.length,before);
  await form.getByRole('button',{name:'Atualizar lançamentos',exact:true}).click();
  await page.getByText('ENTRADA QA 111',{exact:true}).waitFor();assert.equal(last().natureza,'CREDITO');
  assert.equal(await page.getByText('SAIDA QA 1',{exact:true}).count(),0);assert.equal(last().conta_bancaria_id,'9');
  const pageSize=page.getByRole('combobox',{name:/Por página/});await pageSize.selectOption('25');
  await page.waitForFunction(()=>document.body.innerText.includes('25 de 69 exibidos'));
  await page.getByRole('button',{name:'Próxima →',exact:true}).click();
  await page.getByText('ENTRADA QA 136',{exact:true}).waitFor();assert.equal(last().page,'2');assert.equal(last().natureza,'CREDITO');
  // Um rascunho de Debito nao muda a confirmacao/POST do recorte Credito aplicado.
  await select.selectOption('DEBITO');
  await page.getByRole('button',{name:'Conciliar em lote',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/somente créditos \(entradas\)/);
  const oldPosts=posts.length;await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(posts.length,oldPosts);
  await page.getByRole('button',{name:'Conciliar em lote',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Conciliar em lote',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(posts.length,oldPosts+1);assert.equal(posts.at(-1).natureza,'CREDITO');assert.equal(posts.at(-1).conta_bancaria_id,'9');
  await form.getByRole('button',{name:'Atualizar lançamentos',exact:true}).click();
  await page.getByText('SAIDA QA 1',{exact:true}).waitFor();assert.equal(last().natureza,'DEBITO');assert.equal(last().page,'1');
  await form.getByLabel('Data inicial',{exact:true}).fill('22/10/2026');await form.getByLabel('Data inicial',{exact:true}).blur();
  await form.getByRole('button',{name:'Atualizar lançamentos',exact:true}).click();
  await page.waitForTimeout(100);assert.equal(last().data_inicial,'2026-10-22');assert.equal(last().natureza,'DEBITO');
  await form.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'filtro-'+width+'.png')});
  await form.getByRole('button',{name:'Limpar',exact:true}).click();
  await page.waitForTimeout(100);assert.equal(await select.inputValue(),'TODOS');assert.equal(last().natureza,'TODOS');assert.equal(last().page,'1');
 }
 await page.goto(base+'?readonly');await page.getByRole('button',{name:'Conferir manualmente',exact:true}).click();
 await page.getByText('Movimentação',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Conciliar em lote',exact:true}).count(),0);
 legacy=true;await page.goto(base);await page.getByRole('button',{name:'Conferir manualmente',exact:true}).click();
 await page.getByText('SAIDA QA 1',{exact:true}).waitFor();assert.equal(await page.getByText('Movimentação',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Atualizar lançamentos',exact:true}).click();
 await page.getByRole('button',{name:'Conciliar em lote',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Conciliar em lote',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});assert(!Object.hasOwn(posts.at(-1),'natureza'));
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 console.log('PASS OFX desktop/mobile: filtro aplicado no botao, credito fora da pagina inicial, sinais/totais/paginacao, datas/conta, limpar, lote pelo recorte aplicado/cancelamento e permissao. APIs inteiramente ficticias.');
}catch(error){
 if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)fs.writeFileSync(path.join(output,'falha.txt'),await page.locator('body').innerText());}
 throw error;
}finally{await browser?.close();await server.close();}
