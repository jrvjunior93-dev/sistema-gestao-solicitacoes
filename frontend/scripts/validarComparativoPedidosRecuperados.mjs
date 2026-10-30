import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {organizarPedidosRecuperados,itensDoPedidoRecuperado} from '../src/modules/solicitacao-compra/utils/pedidosRecuperadosComparativo.js';
// Mesmo ID numerico, tipos diferentes, duas ocorrencias e ausencias preservadas.
const amostra={itens:[{id:2,item_tipo:'MANUAL'},{id:2,item_tipo:'CADASTRADO'}],pedidos_recuperados:[{pedido_id:313,itens:[
  {pedido_item_id:1,item_tipo:'MANUAL',solicitacao_compra_item_manual_id:2},
  {pedido_item_id:2,item_tipo:'MANUAL',solicitacao_compra_item_manual_id:2},
  {pedido_item_id:3,item_tipo:'CADASTRADO',solicitacao_compra_item_id:2},
  {pedido_item_id:4,item_tipo:'MANUAL',descricao:'Mesmo nome',resposta_item_id:999}]}]};
const antes=JSON.stringify(amostra),h=organizarPedidosRecuperados(amostra);
assert.equal(itensDoPedidoRecuperado(h,h.pedidos[0],amostra.itens[0]).length,2);
assert.equal(itensDoPedidoRecuperado(h,h.pedidos[0],amostra.itens[1]).length,1);
assert.equal(h.semItemAtual.length,1);assert.equal(JSON.stringify(amostra),antes);
assert.equal(organizarPedidosRecuperados(null).pedidos.length,0);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=5314;
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true,proxy:{}}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),output=path.resolve(root,'../outputs/comparativo-pedidos-recuperados-20261030');fs.mkdirSync(output,{recursive:true});
try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[],requests=[];page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===`http://127.0.0.1:${port}`)return r.continue();requests.push(u.href);return r.abort();});
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/comparativoPedidosRecuperados.html`);
  await page.getByRole('button',{name:'Mapa',exact:true}).click();
  assert.equal(await page.locator('[data-recuperado="coluna"]').count(),4);
  const cone=page.locator('.compras-responsive-table tbody tr').filter({has:page.getByText('Cones',{exact:true})});
  assert((await cone.innerText()).includes('25,182'));assert((await cone.innerText()).includes('251,82'));
  const tela=page.locator('.compras-responsive-table tbody tr').filter({has:page.getByText('Tela',{exact:true})});assert((await tela.innerText()).includes('119,99'));
  assert.equal(await page.locator('[data-recuperado] button,[data-recuperado] input,[data-recuperado] a').count(),0,'Historico nao tem acoes de compra/edicao');
  assert((await page.locator('body').innerText()).includes('Pedido cancelado'));
  await page.getByText('Registros recuperados sem correspondência com os itens atuais',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.indevido),undefined);
  const live=page.locator('.compras-responsive-table tbody input[type="checkbox"]');assert.equal(await live.count(),1);await live.check();
  assert.deepEqual(Object.keys(await page.evaluate(()=>window.qaSelecao)),['2115']);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mapa sem overflow da pagina');
  await page.screenshot({path:path.join(output,`mapa-${width}.png`),fullPage:true});
  await page.getByLabel('Valores dos pedidos (4)',{exact:true}).uncheck();assert.equal(await page.locator('[data-recuperado="coluna"]').count(),0);
  assert.deepEqual(Object.keys(await page.evaluate(()=>window.qaSelecao)),['2115']);
  await page.getByLabel('Valores dos pedidos (4)',{exact:true}).check();await page.getByRole('button',{name:'Cards',exact:true}).click();
  assert.equal(await page.locator('[data-recuperado="cards"]').count(),3);
  assert.equal(await page.locator('[data-recuperado] button,[data-recuperado] input,[data-recuperado] a').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Pagina sem overflow; tabela rola internamente');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await page.close();
}console.log('Comparativo real: colunas por pedido, cards por item, valores/precisao, cancelados, ausencias, selecao atual intacta e desktop/mobile. Sem APIs externas.');}
finally{await browser.close();await server.close();}
