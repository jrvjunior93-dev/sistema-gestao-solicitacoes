'use strict';
const { Op, literal } = require('sequelize');
const db = require('../models');
async function sincronizar(ids, { transaction, usuarioId = null } = {}) {
  if (!ids.length) return;
  if (!transaction) throw new Error('Compartilhamento exige sincronização transacional.');
  const linhas = await db.TituloCompartilhadoOrigem.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction });
  const pedidos = [...new Set(linhas.map(a => Number(a.pedido_compra_id)).filter(Boolean))].sort((a, b) => a - b);
  await require('./pedidoCompraFinanceiroService').sincronizarStatusFinanceiroPedidos(pedidos, transaction);
  for (const id of pedidos) {
    const pedido = await db.PedidoCompra.findByPk(id, { transaction });
    const concluido = pedido.status_financeiro === require('./pedidoCompraFinanceiroService').STATUS_FLUXO.CONCLUIDO;
    await db.SolicitacaoCompraAlocacao.update({ status_financeiro: concluido ? 'REALIZADO' : 'PREVISTO',
      valor_realizado: concluido ? literal('valor_total') : 0, realizado_em: concluido ? new Date() : null },
    { where: { pedido_compra_id: id, status: 'ATIVA' }, transaction });
  }
  for (const solicitacaoId of [...new Set(linhas.map(a => Number(a.solicitacao_id)))].sort((a, b) => a - b)) {
    const s = await db.Solicitacao.findByPk(solicitacaoId, { transaction });
    if (!s || s.cancelada) continue;
    await require('./solicitacaoFinanceiroStatusService').sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId, usuarioId, setor: 'FINANCEIRO', transaction,
      observacao: 'Situação financeira atualizada pela participação nos títulos compartilhados.' });
  }
}
module.exports = { sincronizar };
