import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=5307;
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true,proxy:{}}});
await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],unexpected=[],posts=[];
page.on('pageerror',e=>errors.push(e.message));
let completed=false,createBody,denied=false;
const titles=[1,2].map(id=>({id,codigo:`TIT-QA-${id}`,tipo:'PAGAR',status:'ABERTO',valor_original:100,valor_saldo:100,valor_liquido:100,valor_baixado:0,descricao:'Titulo QA',data_vencimento:'2026-10-30',empresa_id:1}));
await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname.endsWith('/gerar-conta')){createBody=req.postDataJSON();return json({id:8,status:'ABERTO'});}
  if(u.pathname.includes('/baixa-lote/')){
    const body=req.postDataJSON();posts.push({path:u.pathname,body});
    if(u.pathname.endsWith('/preview'))return json({titulos:titles.map(t=>({...t,principal:100,juros:5,multa:1,total:106})),total:212,revisao:'a'.repeat(64)});
    await new Promise(r=>setTimeout(r,250));
    if(denied)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Titulos alterados. Confira uma nova previa.'})});
    completed=true;return json({baixados:[{titulo_id:1},{titulo_id:2}],total:212});
  }
  if(u.pathname.endsWith('/titulos-financeiros'))return json(completed?titles.map(t=>({...t,status:'QUITADO',valor_saldo:0})):titles);
  if(u.pathname.endsWith('/financeiro/formas-pagamento'))return json([{id:3,nome:'Pix QA',tipo:'PIX',ativo:true}]);
  if(u.pathname.endsWith('/financeiro/contas-bancarias'))return json([{id:5,nome:'Conta QA',empresa_id:1,ativo:true}]);
  if(u.pathname.endsWith('/financeiro/cartoes'))return json([]);
  if(u.pathname.endsWith('/financeiro/categorias'))return json([{id:1,nome:'Material QA',tipo:'PAGAR',ativo:true,dre_grupo:'CUSTOS'}]);
  if(u.pathname.endsWith('/empresas-grupo'))return json([{id:1,nome:'Empresa QA',ativo:true}]);
  if(u.pathname.endsWith('/obras'))return json([{id:1,nome:'Obra QA',empresa_grupo_id:1}]);
  if(u.pathname.endsWith('/parceiros/1'))return json({id:1,nome:'Credor QA',fornecedor:true,ativo:true,cpf_cnpj:'12345678909'});
  if(u.pathname.endsWith('/parceiros'))return json([]);
  if(u.origin===`http://127.0.0.1:${port}`&&!u.pathname.startsWith('/api')&&!u.pathname.startsWith('/solicitacoes/'))return route.continue();
  unexpected.push(u.pathname);return route.abort();
});
try{
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/cartaoOpcionalSolicitacao.html`);
  assert.equal(await page.getByRole('button',{name:/Baixar selecionados/}).count(),0,'Sem permissao nao oferece baixa');
  await page.getByRole('button',{name:'Criar Título',exact:true}).click();
  await page.getByLabel('Juros (R$)',{exact:true}).fill('10,01');await page.getByLabel('Juros (R$)',{exact:true}).blur();
  await page.getByLabel('Multa (R$)',{exact:true}).fill('3,01');await page.getByLabel('Multa (R$)',{exact:true}).blur();
  await page.getByText('R$ 213,02',{exact:true}).waitFor();
  await page.getByLabel('Categoria financeira deste título').fill('Material');await page.getByRole('option',{name:/Material QA/}).click();
  await page.getByLabel(/^Forma de pagamento/).selectOption('3');
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.locator('#form-gerar-conta').waitFor({state:'detached'});
  assert.equal(createBody.juros,10.01);assert.equal(createBody.multa,3.01);assert.match(createBody.valor,/200,00/);
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/cartaoOpcionalSolicitacao.html?baixa-lote`);
  await page.getByText('Financeiro',{exact:true}).click();
  await page.getByRole('button',{name:/Baixar selecionados/}).waitFor();
  const checks=page.locator('table input[type="checkbox"]');await checks.first().check();
  await page.getByRole('button',{name:/Baixar selecionados \(2\)/}).click();
  await page.getByLabel('Conta financeira',{exact:true}).selectOption('5');
  await page.getByLabel('Forma de pagamento/recebimento',{exact:true}).selectOption('3');
  await page.getByRole('button',{name:'Conferir lote',exact:true}).click();
  await page.getByText(/Total da movimentação:.*212,00/).waitFor();
  const output=path.resolve(root,'../outputs/financeiro-solicitacao-lote-20261030');await mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'conferencia-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'conferencia-mobile.png')});
  await page.getByRole('button',{name:'Confirmar baixas',exact:true}).dblclick();
  await page.getByRole('heading',{name:/Baixa em massa/}).waitFor({state:'detached'});
  assert.equal(posts.filter(p=>p.path.endsWith('/confirmar')).length,1);
  assert.deepEqual(posts[0].body.titulo_ids,[1,2]);assert.equal(posts[1].body.revisao,'a'.repeat(64));assert(posts[1].body.chave);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('UI real: encargos/payload/principal, permissao, selecao multipla, previa, confirmacao unica e mobile aprovados. Somente APIs simuladas.');
}finally{await browser.close();await server.close();}
