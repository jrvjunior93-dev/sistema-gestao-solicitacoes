// Componentes reais; APIs e gravacoes simuladas. Toda conexao externa e bloqueada.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const out=path.resolve(root,'../outputs/qa-compra-titulos-adicionais');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0,proxy:{}}});
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser,page;const errors=[],unexpected=[],requests=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(12000);
 let mode='fail',resolveSend;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname.endsWith('/compras/pedidos/77/financeiro/previsoes')){
   requests.push({key:req.headers()['idempotency-key'],body:req.postDataJSON()});
   await new Promise(r=>{resolveSend=r;});
   if(mode==='fail')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha de resposta QA'})});
   return json({pedido_id:77});
  }
  if(u.pathname.endsWith('/parceiros/1'))return json({id:1,nome:'Credor QA',cpf_cnpj:'12345678909',ativo:true});
  if((u.pathname.includes('/fiscal/')&&!/\.(jsx|js|mjs)$/.test(u.pathname))||u.pathname.endsWith('/parceiros'))return json({data:[],items:[]});
  if(u.origin===origin&&!u.pathname.startsWith('/api/'))return route.continue();
  unexpected.push(u.pathname);return route.abort();
 });
 await page.goto(origin+'/scripts/fixtures/compraTitulosAdicionais.html');await page.getByRole('button',{name:'Criar novos títulos',exact:true}).click();
 await page.getByLabel('Forma de pagamento negociada').selectOption('1');
 await page.getByLabel(/Dados para pagamento/).fill('Dados ficticios QA');
 const create=page.getByRole('button',{name:'Criar títulos',exact:true});
 await create.click();await page.waitForFunction(()=>document.body.textContent.includes('Criando títulos...'));
 assert.equal(requests.length,1);assert(await page.getByRole('button',{name:'Criando títulos...'}).isDisabled());resolveSend();
 await page.getByText('Falha de resposta QA',{exact:true}).waitFor();
 mode='ok';await create.click();await page.waitForFunction(()=>document.body.textContent.includes('Criando títulos...'));assert.equal(requests.length,2);
 assert.equal(requests[0].key,requests[1].key,'Retry do mesmo formulario conserva chave');assert(requests[1].key);
 resolveSend();await page.getByRole('button',{name:'Criar novos títulos',exact:true}).waitFor();
 await page.getByText('TIT-QA-QUITADO',{exact:true}).waitFor();await page.getByText('TIT-QA-NOVO',{exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'pedido-desktop.png')});
 await page.getByRole('button',{name:'Criar novos títulos',exact:true}).click();await create.click();
 await page.waitForFunction(()=>document.body.textContent.includes('Criando títulos...'));assert.equal(requests.length,3);
 assert.notEqual(requests[2].key,requests[1].key,'Nova geracao intencional usa outra chave');resolveSend();await page.getByRole('button',{name:'Criar novos títulos',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'pedido-mobile.png')});
 await page.goto(origin+'/scripts/fixtures/compraTitulosAdicionais.html?leitura=1');await page.getByText('TIT-QA-QUITADO',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Criar novos títulos',exact:true}).count(),0,'Leitor nao recebe criacao');
 await page.unroute('**/*');const solRequests=[];let solFail=true,solRelease;
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname.endsWith('/solicitacoes/100/gerar-conta')){solRequests.push({key:req.headers()['idempotency-key'],body:req.postDataJSON()});await new Promise(r=>{solRelease=r;});return solFail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha de resposta SC QA'})}):json({id:902,status:'ABERTO'});}
  if(u.pathname.endsWith('/solicitacoes/100/titulos-financeiros'))return json([{id:901,codigo:'TIT-QA-QUITADO',status:'QUITADO',valor_original:200,valor_saldo:0,valor_baixado:200,tipo:'PAGAR'}]);
  if(u.pathname.endsWith('/financeiro/formas-pagamento'))return json([{id:1,nome:'Cartão de crédito QA',tipo:'CARTAO_CREDITO',codigo:'CARTAO_CREDITO',ativo:true,exige_cartao:true,gera_fatura:true,permite_parcelamento:true}]);
  if(u.pathname.endsWith('/financeiro/cartoes'))return json([]);
  if(u.pathname.endsWith('/financeiro/categorias'))return json([{id:1,nome:'Material QA',tipo:'PAGAR',ativo:true,dre_grupo:'CUSTOS'}]);
  if(u.pathname.endsWith('/empresas-grupo'))return json([{id:1,nome:'Empresa QA',ativo:true}]);
  if(u.pathname.endsWith('/obras'))return json([{id:1,nome:'Obra QA',empresa_grupo_id:1}]);
  if(u.pathname.endsWith('/parceiros/1'))return json({id:1,nome:'Credor QA',fornecedor:true,ativo:true,cpf_cnpj:'12345678909'});
  if(u.pathname.endsWith('/parceiros'))return json([]);
  if(u.origin===origin&&!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/solicitacoes/'))return route.continue();
  unexpected.push(u.pathname);return route.abort();
 });
 await page.setViewportSize({width:1366,height:900});await page.goto(origin+'/scripts/fixtures/cartaoOpcionalSolicitacao.html');
 await page.getByRole('button',{name:'Criar Título',exact:true}).click();
 await page.getByLabel('Categoria financeira deste título').fill('Material');await page.getByRole('option',{name:/Material QA/}).click();
 await page.getByLabel(/^Forma de pagamento/).selectOption('1');
 await page.locator('#form-gerar-conta').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await page.getByRole('button',{name:'Gerando...',exact:true}).waitFor();assert.equal(solRequests.length,1,'Dois submits simultaneos so enviam uma requisicao');solRelease();
 await page.getByText('Falha de resposta SC QA',{exact:true}).waitFor();solFail=false;
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('button',{name:'Gerando...',exact:true}).waitFor();
 assert.equal(solRequests.length,2);assert.equal(solRequests[0].key,solRequests[1].key);assert(solRequests[0].key);solRelease();
 await page.locator('#form-gerar-conta').waitFor({state:'detached'});await page.getByText('Financeiro',{exact:true}).click();await page.getByText('PAGAR #901',{exact:true}).waitFor();await page.getByText('Quitado',{exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'solicitacao-desktop.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('OK UI: pedido e solicitacao com titulo quitado preservado, criacao nova, submit simultaneo, busy, erro/retry com mesma chave, nova intencao com outra chave e ACL somente leitura, desktop/mobile.');
}catch(e){console.error({errors,unexpected,body:await page?.locator('body').innerText()});throw e;}finally{await browser?.close();await server.close();}
