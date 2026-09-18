import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const virtual = '\0entrega-fixture';
const fixture = {
  id: 8, status: 'FECHADO_FORNECEDOR', itens: [1, 2].map((id) => ({ id, descricao: id === 1 ? 'Arame recozido' : 'Areia fina',
    quantidade_pedido: 10, recebimentos: [], entrega: { previsto: 10, recebido: 0, restante: 10, situacao: 'NAO_ENTREGUE', versao: 1,
      previsao: '2026-09-18', estado: 'OBRA', responsavel: 'OBRA' } }))
};
const js = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PedidoEntrega from '/src/pages/SolicitacaoDetalhe/PedidoEntrega.jsx';
window.envios=[]; window.fixture=${JSON.stringify(fixture)};
function App(){const [pedido,setPedido]=useState(window.fixture); const [compras,setCompras]=useState(false);
return React.createElement('main',{style:{maxWidth:'100%',padding:12}},
 React.createElement('button',{onClick:()=>setCompras(!compras)}, 'Trocar papel'),
 React.createElement(PedidoEntrega,{pedido,solicitacaoId:10,podeReceber:!compras,podeProgramar:compras,
 renderComentarios:(item)=>React.createElement('p',{},'Comentário preservado '+item.id),
 onUpdated:async()=>{setPedido(structuredClone(window.fixture))}}));}
createRoot(document.getElementById('root')).render(React.createElement(App));`;
const api = `export async function registrarEntregaPedido(s,p,data){window.envios.push({s,p,data});
 if(window.falhar){throw new Error('Falha simulada de rede');}
 for(const i of data.itens){const e=window.fixture.itens.find(x=>x.id===i.id).entrega;e.versao++;
 if(data.acao==='RECEBER'){e.recebido+=i.quantidade;e.restante=Math.max(0,e.previsto-e.recebido);e.situacao=e.recebido>e.previsto?'DIVERGENCIA':e.restante?'PARCIAL':'ENTREGUE';}
 if(data.acao==='PREVISAO')e.previsao=i.previsao;}return {};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'entrega-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if(id==='/fixture.jsx')return virtual;
      if(importer?.endsWith('PedidoEntrega.jsx') && id.endsWith('services/compras'))return '\0entrega-api';
      if(importer?.endsWith('PedidoEntrega.jsx') && id.endsWith('components/padrao'))return '\0entrega-confirm';
    },
    load(id){if(id===virtual)return js;if(id==='\0entrega-api')return api;
      if(id==='\0entrega-confirm')return 'export function useConfirmacao(){return {confirmar:async()=>({ok:true}),elementoConfirmacao:null}}';},
    configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');
      res.end(await s.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));}else next();});}
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const erros = [];
  page.on('pageerror', (e) => { erros.push(e.message); console.error(e.message); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const cssName = fs.readdirSync(path.join(root,'dist/assets')).find((n)=>/^index-.*\.css$/.test(n));
  await page.addStyleTag({ path: path.join(root,'dist/assets',cssName) });
  await page.getByRole('checkbox', {name:'Selecionar Arame recozido'}).check();
  assert.equal(await page.getByRole('textbox', {name:'Quantidade de Arame recozido'}).inputValue(), '10');
  await page.getByRole('textbox', {name:'Quantidade de Arame recozido'}).fill('4');
  await page.getByRole('button', {name:'Registrar recebimento',exact:true}).click();
  await page.getByText('Parcialmente entregue',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox', {name:'Quantidade de Arame recozido'}).inputValue(), '6');
  assert.equal(await page.getByText('Comentário preservado 1').count(),1);
  await page.getByRole('textbox', {name:'Quantidade de Arame recozido'}).fill('7');
  await page.getByRole('button', {name:'Marcar como entregue'}).first().click();
  await page.getByText('Entregue com divergência',{exact:true}).waitFor();
  // Duplo clique/retry: falha conserva a mesma chave até alterar o payload.
  await page.evaluate(()=>{window.falhar=true;});
  await page.getByRole('button', {name:'Marcar como entregue'}).nth(1).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', {name:'Marcar como entregue'}).nth(1).click();
  const ultimos=await page.evaluate(()=>window.envios.slice(-2));
  assert.equal(ultimos[0].data.idempotency_key, ultimos[1].data.idempotency_key);
  await page.evaluate(()=>{window.falhar=false;});
  await page.getByRole('button', {name:'Trocar papel'}).click();
  assert.equal(await page.getByRole('button', {name:'Registrar recebimento',exact:true}).count(),0);
  await page.getByRole('checkbox', {name:'Selecionar Areia fina'}).check();
  await page.getByLabel('Data para selecionados').fill('2026-09-25');
  await page.getByRole('textbox',{name:'Motivo / observação'}).fill('Fornecedor confirmou nova data');
  await page.getByRole('button',{name:'Aplicar aos selecionados'}).click();
  await page.getByText(/Previsão: 25\/09\/2026/).waitFor();
  for(const width of [1200,700,375]){
    await page.setViewportSize({width,height:1000});
    const size=await page.evaluate(()=>({viewport:innerWidth,body:document.documentElement.scrollWidth}));
    assert.ok(size.body<=size.viewport+1,`Overflow em ${width}px: ${JSON.stringify(size)}`);
  }
  await page.setViewportSize({width:1200,height:900});
  const pasta=path.join(root,'../outputs/pedido-entrega-qa');fs.mkdirSync(pasta,{recursive:true});
  await page.screenshot({path:path.join(pasta,'entrega-compras.png'),fullPage:true});
  assert.deepEqual(erros,[]);
  console.log('OK: componente real em navegador local; seleção, saldo preenchido, parcial, excesso, retry idempotente, comentários, papéis, previsão e responsividade 375/700/1200px.');
} finally { await browser.close(); await server.close(); }
