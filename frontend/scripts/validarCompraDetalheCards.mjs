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
  itens: [{ id: 91, solicitacao_compra_item_id: 1, descricao: 'Arame', quantidade_pedido: 2, unidade: 'KG', preco_unitario: 50, valor_total: 100, frete_rateado: 10 },
    { id: 92, descricao: 'Item removido', removido: true }],
  financeiro: { status: 'AGUARDANDO_PREVISAO', titulos: [], opcoes: { categorias: [{id: 4, nome: 'Material'}] } } };
const dados = { solicitacao_compra_id: 2, status_compra: 'COTACAO', pedidos: [pedido], comentarios: [
  {id:1,escopo:'ITEM',referencia_id:1,item_tipo:'CADASTRADO',descricao:'Comentário na análise'},
  {id:2,escopo:'PEDIDO_ITEM',referencia_id:91,descricao:'Comentário na entrega'},
  {id:3,escopo:'ITEM',referencia_id:1,item_tipo:'MANUAL',descricao:'Comentário só da areia'}],
  itens: [{id: 1, item_tipo: 'CADASTRADO', nome: 'Arame', quantidade: 2, status_aprovacao: 'APROVADO',em_cotacao:true},
    {id: 1, item_tipo: 'MANUAL', nome: 'Areia manual', quantidade: 3, status_aprovacao: 'REJEITADO'}] };
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';import CompraEtapas from '/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx';
import {useConfirmarEntregasPedidos} from '/src/modules/solicitacao-compra/components/ConfirmarEntregasPedidos.jsx';
window.fixture=${JSON.stringify(dados)};window.envios=[];window.edicoes=[];
function App(){const [papel,setPapel]=useState('SUPERADMIN');const [interagir,setInteragir]=useState(true);
const {confirmarEntregas,elementoEntregas}=useConfirmarEntregasPedidos();
return <MemoryRouter><main style={{minWidth:0,padding:12}}><button onClick={()=>setPapel('OBRA')}>Papel obra</button>
<button onClick={async()=>{window.datasConfirmadas=await confirmarEntregas([
{fornecedor_id:10,fornecedor_nome:'Fornecedor A',prazo_entrega_dias:5,prazo_entrega_tipo:'DIAS_CORRIDOS',data_base:'2026-09-18',previsao_calculada:'2026-09-23'},
{fornecedor_id:20,fornecedor_nome:'Fornecedor B',prazo_entrega_dias:2,prazo_entrega_tipo:'DIAS_UTEIS',data_base:'2026-09-18',previsao_calculada:'2026-09-22'}])}}>Testar confirmação de entregas</button>
{elementoEntregas}
<button onClick={()=>{setInteragir(false);setPapel('CONSULTA')}}>Somente consulta</button><CompraEtapas solicitacaoId={77}
user={{perfil:papel,...(papel==='CONSULTA'?{areas_permissoes:['compras.pedidos.financeiro.visualizar']}: {})}}
mostrarCotacao={papel==='SUPERADMIN'} podeGerenciarCotacao={interagir}
onGerenciarItens={papel==='SUPERADMIN' ? item=>window.edicoes.push(item || 'TODOS') : null}/></main></MemoryRouter>}
createRoot(document.getElementById('root')).render(<App/>);`;
const api = `export async function obterEtapasCompraSolicitacao(){return structuredClone(window.fixture)}
export async function comentarEtapaCompraSolicitacao(id,data){if(window.falharComentario)throw new Error('Falha simulada no comentário');window.comentariosEnviados=(window.comentariosEnviados||[]).concat(data);await new Promise(r=>setTimeout(r,100));window.fixture.comentarios.push({id:window.fixture.comentarios.length+1,...data})}
export async function registrarEntregaPedido(){throw new Error('Entrega fora do escopo deste teste')}
export async function obterPedidoCompra(id){return structuredClone(window.fixture.pedidos.find(p=>p.id===id))}
export async function criarPrevisoesPedidoCompra(id,data){window.envios.push({id,data});await new Promise(r=>setTimeout(r,150));
window.fixture.pedidos[0].financeiro.titulos=[{origem:'NOVO',titulo:{id:700,codigo:'TIT-700',status:'PREVISAO',valor_original:100,data_vencimento:'2026-09-30'}}];}
${['anexarEspelhoPedidoCompra','aprovarItensCompraSolicitacaoEmLote','decidirItemCompraSolicitacao',
  'encaminharSolicitacaoCompraParaCompras','uploadAnexoTemporarioCompra','adotarFinanceiroPedidoCompra','decidirReaberturaPedidoCompra',
  'liberarTitulosPedidoCompra','obterUrlAssinadaCompra','reparcelarPrevisoesPedidoCompra','registrarDocumentoFinanceiroPedidoCompra']
  .map(n=>`export async function ${n}(){throw new Error('Ação não prevista no teste: ${n}')}`).join('\n')}`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  plugins:[{name:'cards-fixture',enforce:'pre',resolveId(id,importer){
    if(id==='/fixture.jsx')return '\0cards-fixture.jsx';
    if(id.endsWith('services/compras'))return '\0cards-api';
    if(importer?.endsWith('CompraEtapas.jsx') && id.endsWith('LiveUpdatesContext'))return '\0cards-live';
    if(importer?.endsWith('CompraEtapas.jsx') && id.endsWith('GerenciarCotacaoSolicitacao'))return '\0cards-quote';
  },async load(id){
    if(id==='\0cards-fixture.jsx')return transformWithEsbuild(fixture, 'fixture.jsx', {loader:'jsx',jsx:'transform'});
    if(id==='\0cards-api')return api;
    if(id==='\0cards-live')return 'export function useLiveUpdateSubscription(){}';
    if(id==='\0cards-quote')return `import React from 'react';export default function Quote(){return React.createElement('div',{},'GESTÃO DA COTAÇÃO MONTADA')}`;
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
  const css=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({path:path.join(root,'dist/assets',css)});
  await page.getByRole('button',{name:'Gerenciar todos os itens'}).click();
  await page.getByRole('button',{name:'Editar Areia manual',exact:true}).first().click();
  const edicoes=await page.evaluate(()=>window.edicoes);
  assert.equal(edicoes[0],'TODOS');assert.equal(edicoes[1].item_tipo,'MANUAL');assert.equal(edicoes[1].id,1);
  assert.equal(await page.getByText('Comentário na análise',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Comentários: Arame',exact:true}).first().click();
  const comentarios=page.getByRole('dialog',{name:'Comentários: Arame',exact:true});
  await comentarios.getByText('Comentário na análise',{exact:true}).waitFor();
  await comentarios.getByText('Comentário na entrega',{exact:true}).waitFor();
  assert.equal(await comentarios.getByText('Comentário só da areia',{exact:true}).count(),0);
  await comentarios.getByRole('textbox',{name:'Comentário',exact:true}).fill('Mensagem preservada entre etapas');
  await page.evaluate(()=>{window.falharComentario=true});
  await comentarios.getByRole('button',{name:'Enviar',exact:true}).click();
  await comentarios.getByText('Falha simulada no comentário',{exact:true}).waitFor();
  assert.equal(await comentarios.getByRole('textbox',{name:'Comentário',exact:true}).inputValue(),'Mensagem preservada entre etapas');
  await page.evaluate(()=>{window.falharComentario=false});
  await comentarios.getByRole('button',{name:'Enviar',exact:true}).dblclick();
  await comentarios.getByText('Mensagem preservada entre etapas',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.comentariosEnviados.length),1);
  for(const width of [700,375]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await comentarios.getByRole('button',{name:'Fechar comentários',exact:true}).click();
  await page.setViewportSize({width:1200,height:900});
  assert.equal(await page.getByText('GESTÃO DA COTAÇÃO MONTADA').count(),0);
  await page.getByRole('button',{name:/^Cotação/}).click();
  await page.getByText('GESTÃO DA COTAÇÃO MONTADA').waitFor();
  await page.getByRole('button',{name:'Comentários: Arame',exact:true}).nth(2).click();
  await comentarios.getByText('Mensagem preservada entre etapas',{exact:true}).waitFor();
  await comentarios.getByRole('button',{name:'Fechar comentários',exact:true}).click();
  await page.getByRole('button',{name:/^Cotação/}).click();
  assert.equal(await page.getByText('GESTÃO DA COTAÇÃO MONTADA').count(),0);
  await page.getByRole('button',{name:/^Pedidos de compra/}).click();
  await page.locator('summary').filter({hasText:'Pedido #12'}).click();
  const resumo=page.getByRole('region',{name:'Resumo do pedido 12'});
  assert.equal(await resumo.getByText('Item removido').count(),0);
  await resumo.getByRole('table',{name:'Itens do pedido',exact:true}).getByRole('cell',{name:'R$ 110,00',exact:true}).waitFor();
  await page.getByRole('region',{name:'Entregas do pedido 12'}).getByRole('button',{name:'Comentários: Arame',exact:true}).click();
  await comentarios.getByText('Mensagem preservada entre etapas',{exact:true}).waitFor();
  await comentarios.getByRole('button',{name:'Fechar comentários',exact:true}).click();
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
    if(width===375)await page.screenshot({path:path.join(saida,'modal-375.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow modal ${width}: ${JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('*')].map(e=>({tag:e.tagName,cl:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth+1).slice(-18)))}`);}
  await modal.getByRole('button',{name:'Fechar títulos do pedido',exact:true}).click();
  for(const width of [1200,700,375]){await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow cards ${width}`);}
  await page.getByRole('button',{name:'Papel obra',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Criar / gerenciar títulos deste pedido'}).count(),0);
  await page.setViewportSize({width:1200,height:1000});
  await page.screenshot({path:path.join(saida,'pedido-expandido.png'),fullPage:true});
  await page.getByRole('button',{name:'Testar confirmação de entregas'}).click();
  const datas=page.getByRole('dialog',{name:'Confirmar entrega dos pedidos'});
  const gerar=datas.getByRole('button',{name:'Confirmar datas e gerar pedidos'});
  assert.equal(await gerar.isDisabled(),true);
  assert.equal(await datas.getByLabel('Entrega de Fornecedor A',{exact:true}).inputValue(),'2026-09-23');
  assert.equal(await datas.getByLabel('Entrega de Fornecedor B',{exact:true}).inputValue(),'2026-09-22');
  await datas.getByLabel('Confirmo a data de Fornecedor A').check();
  await datas.getByLabel('Entrega de Fornecedor A',{exact:true}).fill('2026-09-25');
  assert.equal(await datas.getByLabel('Confirmo a data de Fornecedor A').isChecked(),false);
  await datas.getByLabel('Confirmo a data de Fornecedor A').check();
  await datas.getByLabel('Confirmo a data de Fornecedor B').check();
  await page.screenshot({path:path.join(saida,'confirmar-datas-entrega.png'),fullPage:true});
  await page.setViewportSize({width:375,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await gerar.click();
  const datasSalvas=await page.evaluate(()=>window.datasConfirmadas);
  assert.equal(datasSalvas[0].previsao,'2026-09-25');assert.equal(datasSalvas[0].previsao_calculada,'2026-09-23');
  assert.equal(datasSalvas[1].previsao,'2026-09-22');
  await page.getByRole('button',{name:'Testar confirmação de entregas'}).click();
  await datas.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.datasConfirmadas),null);
  assert.deepEqual(erros,[]);
  console.log('OK: ícones, comentários unificados em modal, envio/erro/duplo clique, tabelas, financeiro por pedido, confirmação/edição/cancelamento de entregas por fornecedor e responsividade. APIs simuladas; sem banco externo.');
} finally {await browser.close();await server.close()}
