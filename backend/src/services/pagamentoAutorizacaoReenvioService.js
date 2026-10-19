'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const { sha256, recordEvent } = require('./pagamentoAutorizacaoEventosService');
const { userHasNominalAreaPermission } = require('./authorizationService');
const { criarNotificacaoDireta } = require('./notificacoes');
const { sendQueueRetryNotification } = require('./webPushService');

// A decisao ja foi commitada. Falha de transporte nunca desfaz a assinatura.
// Lock do lote serializa alertas concorrentes; nao bloqueia/atualiza titulos.
async function notificarEnvioPendente(req, loteId) {
  const aviso = await db.sequelize.transaction(async transaction => {
    const lote = await db.PagamentoAutorizacaoLote.findByPk(loteId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lote || !['AGUARDANDO', 'AUTORIZADO'].includes(lote.status)) return null;
    const itens = await db.PagamentoAutorizacaoItem.findAll({ where: { lote_id: loteId, status: 'AUTORIZADO' },
      transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
    if (!itens.length) return null;
    const chave = sha256({ lote_id: Number(loteId), revisao: Number(lote.revisao_autorizacao || 0), itens: itens.map(i => Number(i.id)) });
    const anterior = await db.PagamentoAutorizacaoEvento.findOne({ where: { lote_id: loteId, tipo: 'ENVIO_FILA_PENDENTE' },
      order: [['id', 'DESC']], transaction });
    if (anterior?.dados_json?.chave === chave) return null;
    // Somente autorizadores nominais ativos, ainda com permissao de decisao.
    const autorizadores = await db.PagamentoAutorizador.findAll({ where: { ativo: true }, transaction });
    const ids = [...new Set(autorizadores.map(a => Number(a.usuario_id)))];
    const usuarios = ids.length ? await db.User.findAll({ where: { id: { [Op.in]: ids }, ativo: true }, transaction }) : [];
    const destinatarios = [];
    for (const user of usuarios) if (await userHasNominalAreaPermission(user, ['financeiro.autorizacoes_pagamento.decidir'])) destinatarios.push(Number(user.id));
    if (!destinatarios.length) return null;
    const rota = `/financeiro/autorizacoes-pagamento?reenvio=${Number(loteId)}`;
    // created_by null: o proprietario deve receber inclusive a propria falha.
    const notificacao = await criarNotificacaoDireta({ tipo: 'PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE',
      mensagem: 'Autorização registrada, mas o envio à fila não foi concluído. Confira e reenvie os títulos autorizados.',
      metadata: { rota, acao: 'REENVIAR_AUTORIZADOS', lote_id: Number(loteId) },
      created_by: null, destinatarios, transaction });
    if (!notificacao) return null; // Respeita configuracao administrativa do evento.
    await recordEvent({ loteId: loteId, userId: req.user?.id, type: 'ENVIO_FILA_PENDENTE',
      data: { chave, itens: itens.map(i => Number(i.id)), notificacao_id: Number(notificacao.id) }, transaction });
    return { destinatarios, loteId: Number(loteId) };
  });
  if (aviso) await sendQueueRetryNotification(aviso.destinatarios, aviso.loteId);
}

module.exports = { notificarEnvioPendente };
