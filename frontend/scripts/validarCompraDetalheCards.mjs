import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pedido = { id: 12, status: 'FECHADO_FORNECEDOR', valor_total: 110, valor_total_fornecedor: 100,
  valor_mercadorias: 100, frete_total: 10, condicao_pagamento: '30 dias', obra: { id: 3, nome: 'Obra teste' },
  fornecedor: { id: 8, nome: 'Fornecedor teste', parceiro_id: 90 },
  itens: [{ id: 91, descricao: 'Arame', quantidade_pedido: 2, unidade: 'KG', preco_unitario: 50, valor_total: 100, frete_rateado: 10 },
    { id: 92, descricao: 'Item removido', removido: true }],
  financeiro: { status: 'AGUARDANDO_PREVISAO', titulos: [], opcoes: { categorias: [{id: 4, nome: 'Material'}] } } };
const dados = { solicitacao_compra_id: 2, status_compra: 'COTACAO', pedidos: [pedido], comentarios: [],
  itens: [{id: 1, item_tipo: 'CADASTRADO', nome: 'Arame', quantidade: 2, status_aprovacao: 'APROVADO'},
    {id: 1, item_tipo: 'MANUAL', nome: 'Areia manual', quantidade: 3, status_aprovacao: 'REJEITADO'}] };
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';import CompraEtapas from '/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx';
window.fixture=${JSON.stringify(dados)};window.envios=[];window.edicoes=[];
function App(){const [papel,setPapel]=useState('SUPERADMIN');const [interagir,setInteragir]=useState(true);
return <MemoryRouter><main style={{minWidth:0,padding:12}}><button onClick={()=>setPapel('OBRA')}>Papel obra</button>
<button onClick={()=>{setInteragir(false);setPapel('CONSULTA')}}>Somente consulta</button><CompraEtapas solicitacaoId={77}
user={{perfil:papel,...(papel==='CONSULTA'?{areas_permissoes:['compras.pedidos.financeiro.visualizar']}: {})}}
mostrarCotacao={papel==='SUPERADMIN'} podeGerenciarCotacao={interagir}
onGerenciarItens={papel==='SUPERADMIN' ? item=>window.edicoes.push(item || 'TODOS') : null}/></main></MemoryRouter>}
createRoot(document.getElementById('root')).render(<App/>);`;
const api = `export async function obterEtapasCompraSolicitacao(){return structuredClone(window.fixture)}
export async function obterPedidoCompra(id){return structuredClone(window.fixture.pedidos.find(p=>p.id===id))}
export async function criarPrevisoesPedidoCompra(id,data){window.envios.push({id,data});await new Promise(r=>setTimeout(r,150));
window.fixture.pedidos[0].financeiro.titulos=[{origem:'NOVO',titulo:{id:700,codigo:'TIT-700',status:'PREVISAO',valor_original:100,data_vencimento:'2026-09-30'}}];}
${['anexarEspelhoPedidoCompra','aprovarItensCompraSolicitacaoEmLote','comentarEtapaCompraSolicitacao','decidirItemCompraSolicitacao',
  'encaminharSolicitacaoCompraParaCompras','uploadAnexoTemporarioCompra','adotarFinanceiroPedidoCompra','decidirReaberturaPedidoCompra',
  'liberarTitulosPedidoCompra','obterUrlAssinadaCompra','reparcelarPrevisoesPedidoCompra','registrarDocumentoFinanceiroPedidoCompra']
  .map(n=>`export async function ${n}(){throw new Error('Ação não prevista no teste: ${n}')}`).join('\n')}`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  plugins:[{name:'cards-fixture',enforce:'pre',resolveId(id,importer){
    if(id==='/fixture.jsx')return '\0cards-fixture.jsx';
    if(id.endsWith('services/compras'))return '\0cards-api';
    if(importer?.endsWith('CompraEtapas.jsx') && id.endsWith('LiveUpdatesContext'))return '\0cards-live';
    if(importer?.endsWith('CompraEtapas.jsx') && id.endsWith('GerenciarCotacaoSolicitacao'))return '\0cards-quote';
    if(importer?.endsWith('CompraEtapas.jsx') && id==='./PedidoEntrega')return '\0cards-delivery';
  },async load(id){
    if(id==='\0cards-fixture.jsx')return transformWithEsbuild(fixture, 'fixture.jsx', {loader:'jsx',jsx:'transform'});
    if(id==='\0cards-api')return api;
    if(id==='\0cards-live')return 'export function useLiveUpdateSubscription(){}';
    if(id==='\0cards-quote')return `import React from 'react';export default function Quote(){return React.createElement('div',{},'GESTÃO DA COTAÇÃO MONTADA')}`;
    if(id==='\0cards-delivery')return 'export default function Delivery(){return null}';
  },configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/fixture'){
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  }else next()})}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('**/usuarios-lista',r=>r.fulfill({json:[]}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css=fs.readdirSync(path.join(root,'dist/assets')).find(n=>/^index-.*\.css$/.test(n));
  await page.addStyleTag({path:path.join(root,'dist/assets',css)});
  await page.getByRole('button',{name:'Gerenciar todos os itens'}).click();
  await page.getByRole('button',{name:'Editar Areia manual',exact:true}).first().click();
  const edicoes=await page.evaluate(()=>window.edicoes);
  assert.equal(edicoes[0],'TODOS');assert.equal(edicoes[1].item_tipo,'MANUAL');assert.equal(edicoes[1].id,1);
  assert.equal(await page.getByText('GESTÃO DA COTAÇÃO MONTADA').count(),0);
  await page.getByRole('button',{name:/^Cotação/}).click();
  await page.getByText('GESTÃO DA COTAÇÃO MONTADA').waitFor();
  await page.getByRole('button',{name:/^Cotação/}).click();
  assert.equal(await page.getByText('GESTÃO DA COTAÇÃO MONTADA').count(),0);
  await page.getByRole('button',{name:/^Pedidos de compra/}).click();
  await page.locator('summary').filter({hasText:'Pedido #12'}).click();
  const resumo=page.getByRole('region',{name:'Resumo do pedido 12'});
  assert.equal(await resumo.getByText('Item removido').count(),0);
  await resumo.getByRole('cell',{name:'R$ 110,00',exact:true}).waitFor();
  await page.getByRole('button',{name:'Criar / gerenciar títulos deste pedido'}).click();
  const modal=page.getByRole('dialog');
  await modal.getByText('Credor (fornecedor do pedido)').waitFor();
  assert.equal(await modal.getByText('Fornecedor teste',{exact:true}).count(),1);
  assert.equal(await modal.getByText('Obra teste',{exact:true}).count(),1);
  assert.equal(await modal.locator('tbody input').first().inputValue(),'100,00');
  await modal.getByLabel('Categoria financeira').selectOption('4');
  await modal.getByRole('button',{name:'Criar previsões',exact:true}).dblclick();
  await modal.getByText('TIT-700',{exact:true}).waitFor();
  const saida=path.join(root,'../outputs/compra-detalhe-cards-qa');fs.mkdirSync(saida,{recursive:true});
  await page.screenshot({path:path.join(saida,'titulos-por-pedido.png'),fullPage:true});
  const envios=await page.evaluate(()=>window.envios);
  assert.equal(envios.length,1);assert.equal(envios[0].id,12);assert.equal(envios[0].data.parcelas[0].valor,100);
  assert.equal(await modal.getByRole('button',{name:'Criar previsões',exact:true}).count(),0);
  await modal.getByRole('button',{name:'Fechar títulos do pedido',exact:true}).click();
  await page.getByRole('button',{name:'Somente consulta',exact:true}).click();
  await page.getByRole('button',{name:'Criar / gerenciar títulos deste pedido'}).click();
  await modal.getByText('TIT-700',{exact:true}).waitFor();
  assert.equal(await modal.getByRole('button',{name:'Editar parcelas',exact:true}).count(),0);
  for(const width of [1200,700,375]){await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow modal ${width}`);}
  await modal.getByRole('button',{name:'Fechar títulos do pedido',exact:true}).click();
  for(const width of [1200,700,375]){await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow cards ${width}`);}
  await page.getByRole('button',{name:'Papel obra',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Criar / gerenciar títulos deste pedido'}).count(),0);
  await page.setViewportSize({width:1200,height:1000});
  await page.screenshot({path:path.join(saida,'pedido-expandido.png'),fullPage:true});
  assert.deepEqual(erros,[]);
  console.log('OK: itens e edição específica, cotação ao expandir, tabela do pedido, modal contextual, criação única, vínculo por pedido, consulta e responsividade. APIs simuladas; sem banco externo.');
} finally {await browser.close();await server.close()}
