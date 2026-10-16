'use strict';
const assert = require('node:assert/strict');
const cache = (nome, exports) => { require.cache[require.resolve(nome)] = { loaded: true, exports }; };
const transaction = { LOCK: { UPDATE: 'UPDATE' } }, atualizacoes = [], solicitacoes = [], lotes = [];
const conferir = options => assert.equal(options.transaction, transaction);
cache('../src/models', {
  TituloCompartilhadoOrigem: { async findAll(options) {
    conferir(options);
    return [
      { pedido_compra_id: 22, solicitacao_id: 2 },
      { pedido_compra_id: 11, solicitacao_id: 1 },
      { pedido_compra_id: 11, solicitacao_id: 1 },
      { pedido_compra_id: null, solicitacao_id: 3 }
    ];
  } },
  PedidoCompra: { async findByPk(id, options) { conferir(options); return { status_financeiro: id === 11 ? 'CONCLUIDO' : 'PREVISTO' }; } },
  SolicitacaoCompraAlocacao: { async update(values, options) { conferir(options); assert.equal(options.where.status, 'ATIVA'); atualizacoes.push({ ...values, id: options.where.pedido_compra_id }); } },
  Solicitacao: { async findByPk(id, options) { conferir(options); return { id, cancelada: id === 2 }; } }
});
cache('../src/services/pedidoCompraFinanceiroService', {
  STATUS_FLUXO: { CONCLUIDO: 'CONCLUIDO' },
  async sincronizarStatusFinanceiroPedidos(ids, tx) { assert.equal(tx, transaction); lotes.push(ids); }
});
cache('../src/services/solicitacaoFinanceiroStatusService', {
  async sincronizarStatusSolicitacaoPorBaixaTitulos(options) { conferir(options); assert.equal(options.usuarioId, 77); solicitacoes.push(options.solicitacaoId); }
});
async function main() {
  const { sincronizar } = require('../src/services/tituloCompartilhadoSincronizacao');
  await assert.rejects(sincronizar([20]), /transacional/);
  await sincronizar([20, 21], { transaction, usuarioId: 77 });
  assert.deepEqual(lotes, [[11, 22]], 'Pedidos únicos em ordem');
  assert.deepEqual(solicitacoes, [1, 3], 'Não restaura nem altera solicitação cancelada');
  assert.equal(atualizacoes[0].status_financeiro, 'REALIZADO');
  assert.equal(atualizacoes[0].valor_realizado.val, 'valor_total');
  assert(atualizacoes[0].realizado_em instanceof Date);
  assert.equal(atualizacoes[1].status_financeiro, 'PREVISTO');
  assert.equal(atualizacoes[1].valor_realizado, 0);
  assert.equal(atualizacoes[1].realizado_em, null);
  console.log('Sincronização compartilhada: pedidos deduplicados, alocações realizado/previsto, transação e solicitações canceladas preservadas. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
