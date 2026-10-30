'use strict';
// Servico real em VM; modelos simulados e nenhum banco/rede/arquivo de negocio.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/services/pedidoCompraService.js'), 'utf8');
function fixture() {
  const itens = [[282, 50], [283, 20], [284, 20], [285, 200], [286, 100]].map(([id, quantidade]) => ({ id, quantidade,
    status_aprovacao: id === 286 ? 'REJEITADO' : 'APROVADO', insumo: { nome: 'Item ' + id } }));
  const d = { id: 687, status: 'FECHAMENTO_PARCIAL', itens, itensManuais: [],
    pedidos: [{ id: 302, status: 'FECHADO_FORNECEDOR' }, { id: 303, status: 'FECHADO_FORNECEDOR' }],
    alocacoes: [{ id: 829, item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 285, quantidade_alocada: 200, status: 'ATIVA', fornecedor_compra_id: 81, pedido_compra_id: 302 },
      { id: 830, item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 282, quantidade_alocada: 50, status: 'ATIVA', fornecedor_compra_id: 44, pedido_compra_id: 303 }],
    fornecedores: [{ id: 90, fornecedor_compra_id: 90, respostas: itens.map(i => ({ id: i.id + 1000, item_tipo: 'CADASTRADO', solicitacao_compra_item_id: i.id,
      disponivel: true, preco: '10.0000000000', quantidade_disponivel: i.quantidade })) }] };
  const persistencias = [];
  const sandbox = { module: { exports: {} }, console, require: name => {
    if (name === './cotacoesIndependentes') return require('../src/services/cotacoesIndependentes');
    if (name === 'sequelize') return require(name);
    if (name === '../models') return {
      SolicitacaoCompra: { findByPk: async (id, opts) => {
        if (!opts.attributes) return d;
        for (const nome of ['itens','itensManuais']) assert(opts.include.find(i=>i.as===nome).attributes.includes('status_aprovacao'));
        const projetar=nome=>d[nome].map(item=>Object.fromEntries(opts.include.find(i=>i.as===nome).attributes.map(k=>[k,item[k]])));
        return {...d,itens:projetar('itens'),itensManuais:projetar('itensManuais'),update:async()=>{throw Error('QA_ATUALIZACAO_INDEVIDA');}};
      } },
      SolicitacaoCompraFechamento: { findOne: async () => ({ numero_rodada: 2 }), create: async registro => {
        persistencias.push(registro); throw Error('QA_LIMITE_PERSISTENCIA');
      } }
    };
    if (name === '../utils/decimalCompras') return require('../src/utils/decimalCompras');
    if (name === './comprasDisponibilidadeService') return require('../src/services/comprasDisponibilidadeService');
    if (name === './pedidoCompraStatusConfig') return { getPedidoCompraStatusConfig: async () => [{ codigo: 'FECHADO_FORNECEDOR', ativo: true }] };
    if (name === './comprasCotacao') return { isSolicitacaoCompraCancelada: () => false, normalizeText: v => String(v || '').toUpperCase(),
      obterQuantidadeBaseFinanceiraCotacao: ({ quantidadeSolicitada, quantidadeDisponivel }) => quantidadeDisponivel ?? quantidadeSolicitada };
    return {};
  } };
  vm.runInNewContext(source + '\nmodule.exports.qa={montarMapaSaldosSolicitacao,montarAlocacoesNormalizadas,sincronizarStatusSolicitacaoCompraPorSaldo};', sandbox);
  return { d, s: sandbox.module.exports, persistencias };
}
test('SOL6658: rejeitado nao entra no saldo; pedidos302/303 e alocacoes permanecem intactos', () => {
  const f = fixture(), antes = JSON.stringify(f.d), saldos = f.s.qa.montarMapaSaldosSolicitacao(f.d);
  assert.equal(saldos.size, 4); assert(!saldos.has('CADASTRADO:286'));
  assert.equal([...saldos.values()].reduce((sum, i) => sum + i.saldo, 0), 40);
  assert.equal([...saldos.values()].find(i => i.item_referencia_id === 282).saldo, 0);
  assert.equal([...saldos.values()].find(i => i.item_referencia_id === 285).saldo, 0);
  assert.equal(JSON.stringify(f.d), antes); assert.equal(f.persistencias.length, 0);
});
test('servico de fechamento real classifica ultima rodada aprovada como FINAL, nao PARCIAL', async () => {
  const f = fixture(), antes = JSON.stringify(f.d);
  await assert.rejects(f.s.gerarPedidosDosVencedores({ solicitacaoId: 687, usuarioId: 15,
    vencedores: [283, 284].map(id => ({ resposta_item_id: id + 1000, quantidade_alocada: 20 })),
    permitirFinal: true, permitirParcial: true, fechamentoParcialConfirmado: false }), /QA_LIMITE_PERSISTENCIA/);
  assert.equal(f.persistencias.length, 1); assert.equal(f.persistencias[0].tipo, 'FINAL');
  assert.equal(f.persistencias[0].numero_rodada, 3); assert.equal(f.persistencias[0].quantidade_total, 40);
  assert.equal(JSON.stringify(f.d), antes);
});
test('restante aprovado continua exigindo confirmacao parcial; permissao final continua exigida', async () => {
  const f = fixture();
  await assert.rejects(f.s.gerarPedidosDosVencedores({ solicitacaoId: 687,
    vencedores: [{ resposta_item_id: 1283, quantidade_alocada: 20 }], permitirParcial: true }),
  { code: 'COMPRA_FECHAMENTO_PARCIAL_REQUER_CONFIRMACAO' });
  await assert.rejects(f.s.gerarPedidosDosVencedores({ solicitacaoId: 687,
    vencedores: [283, 284].map(id => ({ resposta_item_id: id + 1000, quantidade_alocada: 20 })),
    permitirParcial: true, permitirFinal: false }), { code: 'COMPRA_FECHAMENTO_FINAL_SEM_PERMISSAO' });
  assert.equal(f.persistencias.length, 0);
});
test('selecao direta de rejeitado ou pendente e bloqueada, mesmo com excedente ou mapa adulterado', () => {
  for (const status of ['REJEITADO', 'PENDENTE']) {
    const f = fixture(); f.d.itens[4].status_aprovacao = status;
    const mapa = f.s.qa.montarMapaSaldosSolicitacao(f.d); mapa.set('CADASTRADO:286', { saldo: 100 });
    assert.throws(() => f.s.qa.montarAlocacoesNormalizadas(f.d, [{ resposta_item_id: 1286, quantidade_alocada: 100 }], mapa, { permitirExcedente: true }),
      { statusCode: 409, code: 'COMPRA_ITEM_NAO_APROVADO_PARA_FECHAMENTO' });
    assert.equal(f.persistencias.length, 0);
  }
});
test('itens manuais seguem mesma regra, sem apagar alocacao historica de item rejeitado', () => {
  const f = fixture();
  f.d.itensManuais = [{ id: 90, nome_manual: 'Manual aprovado', quantidade: 3, status_aprovacao: 'APROVADO' },
    { id: 91, nome_manual: 'Manual rejeitado', quantidade: 7, status_aprovacao: 'REJEITADO' },
    { id: 92, nome_manual: 'Manual pendente', quantidade: 9, status_aprovacao: 'PENDENTE' }];
  f.d.alocacoes.push({ id: 900, item_tipo: 'MANUAL', solicitacao_compra_item_manual_id: 91, quantidade_alocada: 2, status: 'ATIVA' });
  const antes = JSON.stringify(f.d), saldo = f.s.qa.montarMapaSaldosSolicitacao(f.d);
  assert.equal([...saldo.values()].filter(i => i.item_tipo === 'MANUAL').length, 1);
  assert.equal([...saldo.values()].reduce((s, i) => s + i.saldo, 0), 43);
  f.d.fornecedores[0].respostas.push({ id: 2000, item_tipo: 'MANUAL', solicitacao_compra_item_manual_id: 91, disponivel: true, preco: 10 });
  assert.throws(() => f.s.qa.montarAlocacoesNormalizadas(f.d, [{ resposta_item_id: 2000, quantidade_alocada: 1 }]),
    { code: 'COMPRA_ITEM_NAO_APROVADO_PARA_FECHAMENTO' });
  f.d.fornecedores[0].respostas.pop(); assert.equal(JSON.stringify(f.d), antes);
});
test('null, vazio e ausencia de aprovacao mantem comportamento de compras diretas/legadas', () => {
  for (const status of [null, '', undefined]) {
    const f = fixture(); f.d.itens[4].status_aprovacao = status;
    const saldos = f.s.qa.montarMapaSaldosSolicitacao(f.d);
    assert.equal(saldos.size, 5); assert.equal([...saldos.values()].reduce((sum, i) => sum + i.saldo, 0), 140);
    const alocacoes = f.s.qa.montarAlocacoesNormalizadas(f.d, [{ resposta_item_id: 1286, quantidade_alocada: 100 }]);
    assert.equal(alocacoes.length, 1);
  }
});

test('sincronizacao com projecao SQL de aprovacao nao reabre compra encerrada por rejeitado',async()=>{
 const f=fixture();f.d.status='ENCERRADO';f.d.encerrado_em='2026-10-29';
 for(const id of [283,284])f.d.alocacoes.push({item_tipo:'CADASTRADO',solicitacao_compra_item_id:id,quantidade_alocada:20,status:'ATIVA'});
 const antes=JSON.stringify(f.d);await f.s.qa.sincronizarStatusSolicitacaoCompraPorSaldo({solicitacaoId:687});
 assert.equal(JSON.stringify(f.d),antes);assert.equal(f.persistencias.length,0);
});


test('cotacoes do mesmo fornecedor isolam desconto/frete/DIFAL e nao consomem oferta uma da outra', () => {
  const f=fixture();f.d.alocacoes=[];
  const q1={id:101,fornecedor_compra_id:11,desconto_total:10,frete_tipo:'CIF',frete_valor:5,difal_valor:2,respostas:[{id:501,item_tipo:'CADASTRADO',solicitacao_compra_item_id:283,disponivel:true,preco:'10',quantidade_disponivel:20}]};
  const q2={id:102,fornecedor_compra_id:11,desconto_total:20,frete_tipo:'CIF',frete_valor:8,difal_valor:4,respostas:[{id:502,item_tipo:'CADASTRADO',solicitacao_compra_item_id:284,disponivel:true,preco:'10',quantidade_disponivel:20}]};
  f.d.fornecedores=[q1,q2];
  const al=f.s.qa.montarAlocacoesNormalizadas(f.d,[{resposta_item_id:501,quantidade_alocada:20},{resposta_item_id:502,quantidade_alocada:20}]);
  assert.equal(al.length,2);assert.equal(al[0].desconto_rateado,10);assert.equal(al[1].desconto_rateado,20);
  assert.equal(al[0].frete_rateado,5);assert.equal(al[1].frete_rateado,8);assert.equal(al[0].difal_rateado,2);assert.equal(al[1].difal_rateado,4);
  f.d.alocacoes=[{status:'ATIVA',resposta_item_id:501,fornecedor_compra_id:11,item_tipo:'CADASTRADO',solicitacao_compra_item_id:283,quantidade_alocada:10,desconto_rateado:10,frete_rateado:5,difal_rateado:2}];
  const nova=f.s.qa.montarAlocacoesNormalizadas(f.d,[{resposta_item_id:502,quantidade_alocada:20}]);
  assert.equal(nova[0].desconto_rateado,20);assert.equal(nova[0].frete_rateado,8);assert.equal(nova[0].difal_rateado,4);
});
test('links distintos nao permitem ultrapassar saldo global aprovado',()=>{
  const f=fixture();f.d.alocacoes=[];f.d.fornecedores=[101,102].map((id,index)=>({id,fornecedor_compra_id:11,respostas:[{id:501+index,item_tipo:'CADASTRADO',solicitacao_compra_item_id:283,disponivel:true,preco:'10',quantidade_disponivel:20}]}));
  assert.throws(()=>f.s.qa.montarAlocacoesNormalizadas(f.d,[{resposta_item_id:501,quantidade_alocada:20},{resposta_item_id:502,quantidade_alocada:20}]),/saldo solicitado/);
});
