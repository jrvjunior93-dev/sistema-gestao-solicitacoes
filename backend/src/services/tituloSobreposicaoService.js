'use strict';
// A ausência de vínculo não prova duplicidade. Impede gerar outra obrigação
// até que o operador confira o título avulso, sem cancelá-lo automaticamente.
const { Op } = require('sequelize');
const db = require('../models');
const encerrados = new Set(['CANCELADO', 'ESTORNADO']);
function avulsos(titulos, vinculos) {
  const conhecidos = new Set(vinculos.map(v => Number(v.titulo_financeiro_id)).filter(Boolean));
  return titulos.filter(t => t.tipo === 'PAGAR' && !encerrados.has(t.status) && !conhecidos.has(Number(t.id)));
}
async function assertSemAvulsosCompra(solicitacaoId, transaction) {
  // O mesmo bloqueio é usado pelo lote e pelas gerações individuais.
  if (transaction) await db.Solicitacao.findByPk(Number(solicitacaoId), { transaction, lock: transaction.LOCK.UPDATE });
  const titulos = await db.TituloFinanceiro.findAll({ where: { solicitacao_id: Number(solicitacaoId), tipo: 'PAGAR',
    status: { [Op.notIn]: [...encerrados] } }, attributes: ['id', 'tipo', 'status'],
  transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!titulos.length) return;
  const where = { titulo_financeiro_id: { [Op.in]: titulos.map(t => t.id) } };
  const vinculos = [];
  for (const model of [db.PedidoCompraTitulo, db.SolicitacaoCompraAlocacao, db.PedidoCompraFrete]) {
    vinculos.push(...await model.findAll({ where, attributes: ['titulo_financeiro_id'], transaction }));
  }
  if (avulsos(titulos, vinculos).length) throw Object.assign(new Error(
    'A solicitação possui títulos avulsos sem vínculo com os pedidos. Confira e regularize os existentes antes de gerar novos títulos. Nenhum título foi alterado.'
  ), { statusCode: 409, code: 'TITULOS_AVULSOS_PENDENTES_REVISAO' });
}
async function assertFluxoCompra(solicitacaoId, transaction) {
  const compra = await db.SolicitacaoCompra.findOne({ where: { solicitacao_principal_id: Number(solicitacaoId) }, transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (compra) throw Object.assign(new Error('Esta solicitação possui pedidos de compra. Gere os títulos pelos pedidos ou pelo lote compartilhado, preservando seus vínculos.'),
    { statusCode: 409, code: 'USAR_FLUXO_FINANCEIRO_PEDIDO' });
}
module.exports = { avulsos, assertSemAvulsosCompra, assertFluxoCompra };
