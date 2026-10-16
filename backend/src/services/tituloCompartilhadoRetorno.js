'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const { ehPedidoObraParaSolicitacaoNoFinanceiro } = require('./tituloBloqueioRetornoObraPolicy');
async function reconciliar(ids, { transaction } = {}) {
  if (!ids.length) return 0;
  if (!transaction) return db.sequelize.transaction(t => reconciliar(ids, { transaction: t }));
  const titulos = await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: ids } },
    attributes: ['id', 'compartilhamento_id'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const origens = await db.TituloCompartilhadoOrigem.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction });
  const pendentes = await db.SolicitacaoPedidoRetorno.findAll({ where: {
    solicitacao_id: { [Op.in]: [...new Set(origens.map(o => Number(o.solicitacao_id)))] }, status: 'PENDENTE'
  }, order: [['createdAt', 'ASC'], ['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  let quantidade = 0;
  for (const t of titulos.filter(t => t.compartilhamento_id)) {
    const solicitacoes = new Set(origens.filter(o => Number(o.titulo_financeiro_id) === Number(t.id)).map(o => Number(o.solicitacao_id)));
    const pedido = pendentes.find(p => solicitacoes.has(Number(p.solicitacao_id)) && ehPedidoObraParaSolicitacaoNoFinanceiro(p));
    const [q] = await db.TituloFinanceiro.update({ bloqueado_retorno_obra: Boolean(pedido),
      bloqueio_retorno_pedido_id: pedido?.id || null,
      bloqueio_retorno_motivo: pedido ? `Baixa bloqueada: uma origem do lote possui retorno solicitado pela Obra (pedido #${pedido.id}).` : null,
      bloqueio_retorno_em: pedido?.createdAt || (pedido ? new Date() : null) },
    { where: { id: t.id, status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] } }, transaction });
    quantidade += Number(q);
  }
  return quantidade;
}
module.exports = { reconciliar };
