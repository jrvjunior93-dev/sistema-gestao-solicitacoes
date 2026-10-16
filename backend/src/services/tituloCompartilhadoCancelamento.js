'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const acesso = require('./authorizationService');
const falhar = (statusCode, mensagem) => { throw Object.assign(new Error(mensagem), { statusCode }); };
async function cancelar(req, loteId, body) {
  const id = Number(loteId);
  if (!Number.isSafeInteger(id) || id <= 0 || !body || Object.keys(body).some(k => k !== 'motivo')
    || typeof body.motivo !== 'string' || body.motivo.trim().length < 3 || body.motivo.length > 1000) falhar(400, 'Informe o lote e um motivo de 3 a 1.000 caracteres.');
  if (!await acesso.canAccessFinanceiro(req.user) || !await acesso.canDeleteTitulosFinanceiros(req.user)) falhar(403, 'Sem permissão para cancelar títulos financeiros.');
  return db.sequelize.transaction(async transaction => {
    const lote = await db.TituloCompartilhadoLote.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lote) falhar(404, 'Lote compartilhado não encontrado.');
    const titulos = await db.TituloFinanceiro.findAll({ where: { compartilhamento_id: id }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    if (!titulos.length || titulos.length !== lote.resultado?.titulos?.length) falhar(409, 'O lote possui vínculos inconsistentes. Nenhum registro foi alterado.');
    for (const titulo of titulos) await require('./tituloCompartilhadoLeitura').assertEscopo(req, titulo, transaction);
    if (titulos.every(t => t.status === 'CANCELADO')) return { id, cancelado: true, ja_cancelado: true };
    if (titulos.some(t => !['ABERTO', 'PREVISAO'].includes(t.status) || Number(t.valor_baixado) > 0 || t.cartao_id || t.fatura_cartao_id)) falhar(409, 'O lote possui baixa, cartão ou situação incompatível. Preserve os pagamentos e regularize todo o financeiro antes de cancelar.');
    const ids = titulos.map(t => t.id);
    const [movimentos, fila, autorizacoes, bancarios] = await Promise.all([
      db.MovimentoFinanceiro.count({ where: { titulo_financeiro_id: { [Op.in]: ids }, status: 'ATIVO' }, transaction }),
      db.PagamentoManualFilaItem.count({ where: { titulo_financeiro_id: { [Op.in]: ids }, status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'] } }, transaction }),
      db.PagamentoAutorizacaoItem.count({ where: { titulo_financeiro_id: { [Op.in]: ids }, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }, transaction }),
      // Falha de integração não comprova que o banco deixou de processar.
      db.PaymentIntent.count({ where: { titulo_financeiro_id: { [Op.in]: ids }, status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'BAIXADO'] } }, transaction })
    ]);
    if (movimentos || fila || autorizacoes || bancarios) falhar(409, 'Retire os títulos da fila e regularize autorizações/pagamentos em andamento antes de cancelar o lote.');
    const origens = await db.TituloCompartilhadoOrigem.findAll({ where: { lote_id: id }, transaction });
    const motivo = body.motivo.trim(), agora = new Date();
    await db.TituloFinanceiro.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: req.user.id }, {
      where: { id: { [Op.in]: ids } }, transaction, cancelandoCompartilhamento: true, adiarSincronizacaoCompartilhamento: true
    });
    await db.PedidoCompraTitulo.update({ status_liberacao: 'CANCELADO', cancelado_por: req.user.id, cancelado_em: agora, motivo_cancelamento: motivo },
      { where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction });
    await require('./tituloCompartilhadoSincronizacao').sincronizar(ids, { transaction, usuarioId: req.user.id });
    await lote.update({ resultado: { ...lote.resultado, cancelado_em: agora.toISOString(), cancelado_por: req.user.id, motivo_cancelamento: motivo } }, { transaction });
    for (const solicitacao_id of [...new Set(origens.map(o => Number(o.solicitacao_id)))]) await db.Historico.create({
      solicitacao_id, usuario_responsavel_id: req.user.id, setor: 'FINANCEIRO', acao: 'LOTE_COMPARTILHADO_CANCELADO',
      descricao: `Lote compartilhado #${id} cancelado integralmente, sem excluir histórico ou pagamentos. Motivo: ${motivo}`,
      metadata: JSON.stringify({ lote_id: id, titulo_ids: ids })
    }, { transaction });
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'SHARED_FINANCIAL_TITLES_CANCELLED',
      recurso_tipo: 'TITULOS_COMPARTILHADOS', recurso_id: String(id), status: 'SUCCESS', descricao: motivo, metadata: { titulo_ids: ids } }, { transaction });
    return { id, cancelado: true, ja_cancelado: false };
  });
}
module.exports = { cancelar };
