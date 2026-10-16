'use strict';
const { Op } = require('sequelize');
const { PagamentoAutorizacaoItem, PagamentoAutorizacaoLote, PagamentoManualFilaItem, PaymentIntent, MovimentoFinanceiro } = require('../models');
const { recordEvent } = require('./pagamentoAutorizacaoEventosService');
const { erro } = require('./medicaoPagamentoDomain');

// Titulo bloqueado pelo chamador. Nao altera snapshot, passkey, documentos ou
// decisor original: INVALIDADO e uma mudanca de dados, nao uma decisao do dono.
async function prepararCorrecao(req, titulo, motivo, transaction) {
  const options = { transaction, lock: transaction.LOCK.UPDATE };
  const movimento = await MovimentoFinanceiro.findOne({ where: { titulo_financeiro_id: titulo.id, status: 'ATIVO' }, ...options });
  const bancario = await PaymentIntent.findOne({ where: { titulo_financeiro_id: titulo.id,
    status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'] } }, ...options });
  if (movimento || bancario) throw erro('Existe baixa ou pagamento bancario vinculado. Regularize esse fluxo antes do ajuste.', 409);
  const candidatos = await PagamentoAutorizacaoItem.findAll({ where: { titulo_financeiro_id: titulo.id,
    status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }, attributes: ['lote_id'], transaction });
  const lotes = [...new Set(candidatos.map(a => Number(a.lote_id)))].sort((a, b) => a - b);
  const alterados = [];
  for (const loteId of lotes) {
    const lote = await PagamentoAutorizacaoLote.findByPk(loteId, options);
    if (!lote) throw erro('Dossie inconsistente. Confira a autorizacao.', 409);
    const todos = await PagamentoAutorizacaoItem.findAll({ where: { lote_id: loteId }, order: [['id', 'ASC']], ...options });
    for (const item of todos.filter(a => Number(a.titulo_financeiro_id) === Number(titulo.id)
      && ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'].includes(a.status))) {
      const anterior = item.status;
      // Invalidacao nao e nova decisao: preservar tambem o motivo original.
      await item.update({ status: 'INVALIDADO' }, { transaction });
      await recordEvent({ loteId, itemId: item.id, userId: req.user.id, type: 'ITEM_INVALIDADO_AJUSTE_MEDICAO',
        data: { titulo_id: titulo.id, status_anterior: anterior, motivo, nova_autorizacao_obrigatoria: true }, transaction });
      alterados.push(item.id);
    }
    const status = todos.some(a => a.status === 'PENDENTE') ? 'AGUARDANDO'
      : todos.some(a => a.status === 'AUTORIZADO') ? 'AUTORIZADO'
        : todos.some(a => a.status === 'ENFILEIRADO') ? 'CONCLUIDO' : 'REJEITADO';
    await lote.update({ status, revisao_autorizacao: Number(lote.revisao_autorizacao || 0) + 1 }, { transaction });
  }
  const filas = await PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: titulo.id,
    status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'] } }, order: [['id', 'ASC']], ...options });
  if (filas.some(f => f.movimento_financeiro_id || Number(f.valor_informado || 0) > 0 || f.processado_em)) {
    throw erro('A fila ja foi processada. Confira a baixa antes de corrigir o valor.', 409);
  }
  for (const fila of filas) await fila.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: new Date(),
    motivo: `Encerrado sem baixa para ajuste de medicao: ${motivo}` }, { transaction });
  return { autorizacoes_invalidadas: alterados, filas_encerradas: filas.map(f => f.id) };
}
module.exports = { prepararCorrecao };
