'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{test}=require('node:test');
const arquivo=require.resolve('../src/controllers/SolicitacaoCompraController');
const source=fs.readFileSync(arquivo,'utf8'),cotacao=require('../src/services/comprasCotacao');
const deps={...require('../src/services/cotacoesIndependentes'),...cotacao,...require('../src/services/comprasDisponibilidadeService'),
  normalizeTextCompra:cotacao.normalizeText,arredondarMoeda:v=>Math.round((Number(v)+Number.EPSILON)*100)/100,
  require:n=>{assert.equal(n,'../services/historicoPropostasCompra');return require('../src/services/historicoPropostasCompra');}};
const helper=source.slice(source.indexOf('function buildRespostaItemKey('),source.indexOf('function normalizarItensSelecionadosCotacao('));
const comparar=new Function(...Object.keys(deps),helper+source.slice(source.indexOf('function montarComparativoSolicitacao('),source.indexOf('function desenharCabecalhoFicha('))+';return montarComparativoSolicitacao;')(...Object.values(deps));
function fixture(){
  const item=(id,origem,preco,qtd,total)=>({id,item_tipo:'MANUAL',solicitacao_compra_item_manual_id:origem,descricao:'Item preservado',preco_unitario:preco,quantidade_pedido:qtd,valor_total:total,removido:false});
  const pedido=(id,status,itens)=>({id,solicitacao_compra_id:724,status,fornecedor:{nome:'Mercado Pago'},createdAt:`2026-10-29T17:${id-300}:00Z`,valor_total:status==='CANCELADO'?'0.00':itens[0].valor_total,itens});
  return {id:724,status:'FECHAMENTO_PARCIAL',itens:[],alocacoes:[],
    itensManuais:[1,2,3,4].map(id=>({id,nome_manual:['Placa obra','Cones','Placa cavalete','Tela'][id-1],quantidade:10,status_aprovacao:'APROVADO',apropriacoes:[]})),
    fornecedores:[{id:327,fornecedor_compra_id:11,status:'RESPONDIDO',fornecedor:{id:11,nome:'Mercado Pago'},itensSelecionados:[],respostas:[{id:2115,item_tipo:'MANUAL',solicitacao_compra_item_manual_id:3,disponivel:true,quantidade_disponivel:4,preco:'154.3980000000'}]}],
    pedidos:[pedido(313,'CANCELADO',[item(906,2,'25.1820000000','10','251.82'),item(907,4,'2.3998000000','50','119.99')]),
      pedido(314,'FECHADO_FORNECEDOR',[item(908,4,'2.3998000000','50','119.99')]),pedido(315,'FECHADO_FORNECEDOR',[item(909,2,'25.1820000000','10','251.82')]),
      pedido(316,'FECHADO_FORNECEDOR',[item(910,3,'154.3980000000','4','617.59')])]};
}
test('comparativo REAL preserva resposta atual e recupera valores separados de cada pedido sem escrita',()=>{
  const compra=fixture(),antes=JSON.stringify(compra),r=comparar(compra);
  assert.equal(JSON.stringify(compra),antes);assert.deepEqual(r.pedidos_recuperados.map(p=>p.pedido_id),[313,314,315,316]);
  assert.equal(r.pedidos_recuperados[0].status_pedido,'CANCELADO');assert.equal(r.pedidos_recuperados[0].valor_atual_pedido,'0.00');
  assert.equal(r.pedidos_recuperados[2].itens[0].preco_unitario,'25.1820000000');assert.equal(r.pedidos_recuperados[2].itens[0].solicitacao_compra_item_manual_id,2);
  assert.equal(r.itens.reduce((n,i)=>n+i.respostas.length,0),1,'Valores recuperados nao viram ofertas selecionaveis');
  assert.equal(r.itens.find(i=>i.id===3).melhor_preco.resposta_item_id,2115);assert.equal(r.itens.find(i=>i.id===2).melhor_preco,null);
  const outro={...compra.pedidos[0],id:800,solicitacao_compra_id:999};compra.pedidos.push(outro);assert.equal(comparar(compra).pedidos_recuperados.length,4);
});
test('leitor REAL dos pedidos carrega IDs e valores persistidos, sem usar resposta atual para ligar itens',async()=>{
  const start=source.indexOf('async function carregarSolicitacaoCompra('),end=source.indexOf('\nfunction ',start);
  const code=source.slice(start,end);let query;
  // Interrompe na fronteira SQL: nenhuma conexao/model real e inicializado.
  const placeholder=Object.assign(()=>[],{findByPk:async(id,opts)=>{query=opts;return null;}});
  const ctx=new Proxy({Op:require('sequelize').Op,require:()=>({})},{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:k in o?o[k]:placeholder});
  const run=new Function('ctx','with(ctx){'+code+';return carregarSolicitacaoCompra;}')(ctx);
  await run(724);
  const itens=query.include.find(i=>i.as==='pedidos').include.find(i=>i.as==='itens');
  for(const campo of ['item_tipo','solicitacao_compra_item_id','solicitacao_compra_item_manual_id','quantidade_pedido','preco_unitario','valor_total','removido','quantidade_cancelada'])assert(itens.attributes.includes(campo),campo);
});
test('workspace REAL verifica permissao e escopo antes de devolver comparativo, sem escrita',async()=>{
  const code=source.slice(source.indexOf('  async workspaceCotacao('),source.indexOf('\n  async encerrar(',source.indexOf('  async workspaceCotacao('))).trim().replace(/,$/,'');
  let consultou=0,gerou=0;
  const ctx={validarAcesso:async()=>false,carregarSolicitacaoCompra:async()=>{consultou++;return fixture();},isSolicitacaoCompraDireta:()=>false,isCompraAguardandoDiretoria:()=>false,podeAcompanharCompraAntesLiberacao:async()=>true,
    validarEscopoSolicitacaoCompra:async()=>false,montarComparativoSolicitacao:()=>{gerou++;},console,
    require:n=>n.includes('pedidoEntregaDomain')?{hojeBrasil:()=> '2026-10-30',previsaoDaCotacao:()=>null}:{calendarioEntrega:async()=>[]}};
  const run=vm.runInNewContext('({'+code+'}).workspaceCotacao',ctx),res={status(){return this;},json(){throw Error('Resposta indevida');}};
  await run({params:{id:724}},res);assert.equal(consultou,0);
  ctx.validarAcesso=async()=>({id:1});await run({params:{id:724}},res);assert.equal(consultou,1);assert.equal(gerou,0);
});
module.exports={fixture,comparar};
