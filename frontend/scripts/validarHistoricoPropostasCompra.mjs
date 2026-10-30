import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../tailwind.config.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {montarHistoricoPropostasCompra}=require('../../backend/src/services/historicoPropostasCompra.js');
const item=(id,nome,valor)=>({id,descricao:nome,quantidade_pedido:'10',preco_unitario:'25.1820000000',valor_total:valor,resposta_item_id:id+1000});
const registros=montarHistoricoPropostasCompra(724,[
 {id:313,solicitacao_compra_id:724,createdAt:'2026-10-29T16:48:53Z',status:'CANCELADO',valor_total:'0.00',fornecedor:{nome:'Mercado Pago'},fechamento:{solicitacao_compra_id:724,numero_rodada:1,tipo:'PARCIAL'},itens:[item(906,'Cones','251.82'),item(907,'Tela <script>window.indevido=true</script>','119.99')]},
 {id:314,solicitacao_compra_id:724,createdAt:'2026-10-29T17:05:44Z',status:'FECHADO_FORNECEDOR',valor_total:'119.99',fornecedor:{nome:'Mercado Pago'},itens:[item(908,'Tela','119.99')]}
]);
const js=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Historico from './src/pages/SolicitacaoDetalhe/HistoricoFechamentosCompra.jsx'; createRoot(document.getElementById('root')).render(React.createElement(Historico,{registros:${JSON.stringify(registros)}}));`,resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwindcss({...config,content:[{raw:fs.readFileSync(path.join(root,'src/pages/SolicitacaoDetalhe/HistoricoFechamentosCompra.jsx'),'utf8'),extension:'jsx'}]})]).process('@tailwind utilities;',{from:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true});
const output=path.resolve(root,'../outputs/historico-propostas-recuperadas-20261030');fs.mkdirSync(output,{recursive:true});
try {
 for(const width of [1280,375]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
  await page.setContent(`<html lang="pt-BR"><head><style>*{box-sizing:border-box}body{margin:0;padding:12px;font-family:Arial;color:#132443;--c-border:#d5dfec;--c-muted:#52627b}#root{max-width:1100px;margin:auto}${css.css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({content:js.outputFiles[0].text});
  await page.getByText('Histórico de fechamentos e propostas anteriores').click();
  await page.locator('summary').filter({hasText:'PC-00313'}).click();
  await page.getByText('Dados recuperados dos registros atuais').waitFor();
  assert.equal(await page.locator('table tbody tr:visible').count(),2);
  assert((await page.locator('body').innerText()).includes('371,81'));
  assert((await page.locator('body').innerText()).includes('25,182'));
  assert.equal(await page.evaluate(()=>window.indevido),undefined);
  assert.equal(await page.locator('button, input, a').count(),0,'Historico nao cria acoes de escrita ou links sinteticos.');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Sem overflow da pagina.');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await page.screenshot({path:path.join(output,`historico-${width}.png`),fullPage:true});await page.close();
 }
 console.log('OK: componente real em desktop/mobile, cancelado e valores preservados, escape de texto, sem rede ou acoes de escrita.');
} finally {await browser.close();}
