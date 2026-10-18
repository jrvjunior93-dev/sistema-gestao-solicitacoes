'use strict';
const { Op } = require('sequelize');
const { TituloFinanceiro, PagamentoAutorizacaoItem, PagamentoManualFilaItem, PaymentIntent } = require('../models');
const { recordEvent } = require('./pagamentoAutorizacaoEventosService');
const erro = message => Object.assign(new Error(message), { statusCode: 409 });

// Chamado somente depois de ACL nominal, passkey e lock canonico titulo -> lote -> item.
module.exports = async function rejeitarFila({ req, lotId, item, motivo, transaction }) {
  if (!motivo?.trim()) throw Object.assign(new Error('Informe o motivo da rejeicao.'), { statusCode: 400 });
  const title = await TituloFinanceiro.findByPk(item.titulo_financeiro_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!title || title.tipo !== 'PAGAR' || title.renegociado_por_id || !['ABERTO', 'PARCIAL'].includes(title.status) || Number(title.valor_saldo) <= 0) {
    throw erro('Titulo sem saldo disponivel para rejeicao. Atualize antes de decidir.');
  }
  require('./rhPagamentoRevisaoPolicy').assertSemRevisaoDp(title);
  const ciclos = await PagamentoAutorizacaoItem.findAll({ where: { titulo_financeiro_id: title.id,
    status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }, transaction,
    lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
  if (ciclos.some(c => Number(c.id) > Number(item.id))) throw erro('Existe autorizacao mais recente. Abra o titulo atual para rejeitar.');
  const banco = await PaymentIntent.findOne({ where: { titulo_financeiro_id: title.id,
    status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'BAIXADO'] } },
    transaction, lock: transaction.LOCK.UPDATE });
  if (banco) throw erro('Pagamento bancario em andamento: cancele esse fluxo antes de rejeitar.');
  const fila = await PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: title.id,
    status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'] } }, transaction,
    lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
  if (fila.some(f => f.status === 'EM_EDICAO')) throw erro('Titulo em revisao pelo DP. Finalize a revisao antes de rejeitar.');
  const quando = new Date();
  const bloqueio = { lote_id: Number(lotId), item_id: Number(item.id), usuario_id: Number(req.user.id),
    motivo: motivo.trim(), em: quando.toISOString(), saldo: Number(title.valor_saldo), pago: Number(title.valor_baixado || 0) };
  // Nao mudar valores, comprovantes, movimentos, status financeiro ou baixas anteriores.
  await title.update({ bloqueio_pagamento_proprietario: bloqueio }, { transaction });
  for (const row of fila) await row.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: quando,
    motivo: `Saldo rejeitado pelo proprietario: ${motivo}` }, { transaction });
  await item.update({ status: 'REJEITADO', motivo_decisao: motivo, decidido_em: quando }, { transaction });
  await recordEvent({ loteId: lotId, itemId: item.id, userId: req.user.id, type: 'ITEM_REJEITADO_NA_FILA',
    data: { ...bloqueio, titulo_id: title.id, fila_ids: fila.map(f => f.id) }, transaction });
};
