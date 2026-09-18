const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../src/services/pedidoEntregaDomain');
const { validateCompraEncerrarBody } = require('../src/validators/operationalValidators');
const hoje = '2026-09-18';
const feriados = ['2026-09-21'];
const cotacoes = [
  { fornecedor_compra_id: 10, prazo_entrega_dias: 5, prazo_entrega_tipo: 'DIAS_CORRIDOS' },
  { fornecedor_compra_id: 20, prazo_entrega_dias: 2, prazo_entrega_tipo: 'DIAS_UTEIS' }
];
assert.equal(domain.previsaoDaCotacao(cotacoes[0], hoje), '2026-09-23');
assert.equal(domain.previsaoDaCotacao(cotacoes[1], hoje), '2026-09-22');
assert.equal(domain.previsaoDaCotacao(cotacoes[1], hoje, feriados), '2026-09-23');
assert.equal(domain.previsaoDaCotacao({ prazo_entrega_dias: 1, prazo_entrega_tipo: 'DIAS_CORRIDOS' }, '2026-12-31'), '2027-01-01');
assert.equal(domain.previsaoDaCotacao({ prazo_entrega_dias: 1, prazo_entrega_tipo: 'DIAS_CORRIDOS' }, '2028-02-28'), '2028-02-29');
assert.equal(domain.previsaoDaCotacao({ prazo_entrega_dias: null }, hoje), null);
assert.equal(domain.previsaoDaCotacao({ prazo_entrega_dias: -1, prazo_entrega_tipo: 'DIAS_UTEIS' }, hoje), null);
const confirmacoes = cotacoes.map(c => ({ fornecedor_id: c.fornecedor_compra_id, data_base: hoje, confirmada: true,
  previsao_calculada: domain.previsaoDaCotacao(c, hoje, feriados), previsao: c.fornecedor_compra_id === 10 ? '2026-09-25' : '2026-09-23' }));
assert.equal(domain.confirmarPrevisaoFornecedor(cotacoes[0], confirmacoes[0], hoje, feriados).alterada, true);
assert.throws(() => domain.confirmarPrevisaoFornecedor(cotacoes[0], { ...confirmacoes[0], confirmada: false }, hoje), /Confirme/);
assert.throws(() => domain.confirmarPrevisaoFornecedor(cotacoes[0], { ...confirmacoes[0], data_base: '2026-09-17' }, hoje), /data de geração mudou/);
assert.throws(() => domain.confirmarPrevisaoFornecedor(cotacoes[0], { ...confirmacoes[0], previsao: '2026-09-17' }, hoje), /hoje ou futura/);
assert.throws(() => domain.confirmarPrevisaoFornecedor({ ...cotacoes[0], prazo_entrega_dias: 8 }, confirmacoes[0], hoje), /prazo da cotação/);
const body = { alocacoes: [{ resposta_item_id: 1, quantidade_alocada: 1 }], previsoes_entrega: confirmacoes };
assert.equal(validateCompraEncerrarBody(body).previsoes_entrega.length, 2);
assert.throws(() => validateCompraEncerrarBody({ ...body, previsoes_entrega: [confirmacoes[0], confirmacoes[0]] }), /repetido/);
assert.throws(() => validateCompraEncerrarBody({ ...body, previsoes_entrega: [{ ...confirmacoes[0], confirmada: false }] }), /Confirme/);
assert.throws(() => validateCompraEncerrarBody({ ...body, previsoes_entrega: [{ ...confirmacoes[0], previsao: '2026-02-30' }] }), /invalida|inválida/);

// Função de geração real isolada em VM; colaboradores/persistência simulados, sem banco.
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/pedidoCompraService.js'), 'utf8');
const trecho = source.slice(source.indexOf('async function gerarPedidosDosVencedores('), source.indexOf('async function encerrarSaldoSolicitacaoCompraSemPedido('));
let entregas = [], historicos = [], pedidoCriado = 0;
const transaction = {};
const alocacoes = cotacoes.map((c, index) => ({ itemKey: `I${index}`, quantidade_alocada: 1, valor_total: 10,
  vinculacaoFornecedor: c, resposta: {id: index+1}, registro: {resposta_item_id:index+1,quantidade_alocada:1,preco_unitario:10, update:async()=>{}} }));
const context = {
  carregarSolicitacaoPedidos: async () => ({id: 77,status:'COTACAO'}), isSolicitacaoCompraCancelada: () => false,
  normalizeCotacaoText: String, normalizeText: String, roundQty: Number, roundMoney: Number, asNumber: v => Number(v||0),
  SolicitacaoCompraFechamento: {findOne:async()=>null,create:async()=>({id:1})},
  montarMapaSaldosSolicitacao:()=>new Map(alocacoes.map(a=>[a.itemKey,{saldo:1,item_key:a.itemKey}])),
  montarAlocacoesNormalizadas:()=>alocacoes,persistirAlocacoesSolicitacao:async()=>alocacoes,
  criarPedidoPorFornecedorRodada:async({vinculacaoFornecedor})=>{pedidoCriado++;return {id:vinculacaoFornecedor.fornecedor_compra_id}},
  adicionarRespostasAoPedido:async({pedido,respostaItemIds})=>({itens:[{id:pedido.id*10,resposta_item_id:respostaItemIds[0],update:async()=>{}}]}),
  registrarHistoricoPedidoNaSolicitacaoPrincipal:async data=>historicos.push(data),
  recalcularPedidoPorId:async id=>({id}),sincronizarRateiosFretesPendentesPedido:async()=>{},
  require:(id)=>{
    if(id==='./pedidoEntregaDomain')return {...domain,hojeBrasil:()=>hoje};
    if(id==='./pedidoEntregaService')return {calendarioEntrega:async()=>feriados};
    if(id==='../models')return {PedidoCompraEntrega:{bulkCreate:async(linhas,options)=>{assert.equal(options.transaction,transaction);entregas.push(...linhas)}}};
    throw new Error(`Dependência não prevista: ${id}`);
  }
};
vm.createContext(context);
vm.runInContext(`${trecho};this.gerar=gerarPedidosDosVencedores`,context);
(async()=>{
  const resultado=await context.gerar({solicitacaoId:77,permitirFinal:true,previsoesEntrega:confirmacoes,transaction});
  assert.equal(resultado.pedidos.length,2);
  assert.equal(entregas.find(e=>e.pedido_compra_id===10).previsao,'2026-09-25');
  assert.equal(entregas.find(e=>e.pedido_compra_id===20).previsao,'2026-09-23');
  assert.equal(historicos[0].metadados.calculada,'2026-09-23');assert.equal(historicos[0].metadados.alterada,true);
  assert.equal(historicos[1].metadados.alterada,false);
  const antes=pedidoCriado;
  await assert.rejects(()=>context.gerar({solicitacaoId:77,permitirFinal:true,previsoesEntrega:[confirmacoes[0]],transaction}),/corresponder/);
  assert.equal(pedidoCriado,antes);
  console.log('OK: cálculo em dias corridos/úteis, feriados, virada de ano, data editada/confirmada, validações e persistência por fornecedor na geração real com mocks. Sem banco externo.');
})().catch(error=>{console.error(error);process.exitCode=1});
