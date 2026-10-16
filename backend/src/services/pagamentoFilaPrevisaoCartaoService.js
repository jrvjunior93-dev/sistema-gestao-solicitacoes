'use strict';
// Chamadas internas, apos conferir permissao/escopo e travar o titulo.
// Enfileirar nao desfaz previsao; baixa e desvinculacao explicita sao atomicas.
const { FaturaCartaoFinanceiro, FaturaCartaoTitulo, MovimentoFinanceiro,
  SecurityEventLog } = require('../models');
const { recalcularFaturaCartao } = require('./faturaCartaoFinanceiroService');
const { getRequestIp } = require('./securityLogService');

function conflito(message) {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

async function validarPrevisaoCartaoFila(titulo, transaction) {
  if (!titulo.fatura_cartao_id) return null;
  if (!transaction?.LOCK?.UPDATE) throw new Error('Previsao de cartao exige transacao interna da fila.');
  if (String(titulo.status).toUpperCase() !== 'ABERTO' || Number(titulo.valor_baixado || 0) !== 0) {
    conflito('Titulo com baixa anterior nao pode corrigir a previsao de cartao pela fila.');
  }
  const fatura = await FaturaCartaoFinanceiro.findByPk(titulo.fatura_cartao_id,
    { transaction, lock: transaction.LOCK.UPDATE });
  if (!fatura || String(fatura.status).toUpperCase() !== 'ABERTA' || fatura.data_pagamento
    || fatura.conciliacao_bancaria_id || fatura.pago_por) {
    conflito('A fatura prevista nao esta aberta e sem pagamento. Regularize a fatura antes de usar a fila.');
  }
  const vinculo = await FaturaCartaoTitulo.findOne({ where: { titulo_financeiro_id: titulo.id },
    transaction, lock: transaction.LOCK.UPDATE });
  if (!vinculo || Number(vinculo.fatura_cartao_id) !== Number(fatura.id)
    || Number(titulo.cartao_id) !== Number(fatura.cartao_id)) {
    conflito('Vinculo da previsao de cartao inconsistente. Regularize o titulo antes de usar a fila.');
  }
  // Uma outra compra da mesma fatura pode ter baixa CARTAO_CREDITO. Isso nao
  // equivale ao pagamento da fatura; o bloqueio de compra e especifico do titulo.
  // Consultas separadas aproveitam os indices legados de titulo e tipo de
  // movimento, sem OR entre titulo/fatura em toda a tabela financeira.
  const movimentoTitulo = await MovimentoFinanceiro.findOne({ where: {
    status: 'ATIVO', titulo_financeiro_id: titulo.id
  }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
  const movimento = movimentoTitulo || await MovimentoFinanceiro.findOne({ where: {
    status: 'ATIVO', fatura_cartao_id: fatura.id, tipo_movimento: 'PAGAMENTO_FATURA'
  }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
  if (movimento) conflito('Titulo ou fatura com movimento financeiro ativo. Nao e possivel corrigir a previsao pela fila.');
  return fatura;
}

async function desvincularPrevisaoCartao(titulo, usuarioId, transaction) {
  const fatura = await validarPrevisaoCartaoFila(titulo, transaction);
  if (!fatura) return null;
  const anterior = {
    forma_pagamento_id: titulo.forma_pagamento_id,
    cartao_id: titulo.cartao_id,
    fatura_cartao_id: fatura.id,
    data_compra: titulo.data_compra,
    data_vencimento: titulo.data_vencimento,
    numero_parcela: titulo.numero_parcela,
    total_parcelas: titulo.total_parcelas,
    valor_original: titulo.valor_original
  };
  const removidos = await FaturaCartaoTitulo.destroy({ where: {
    titulo_financeiro_id: titulo.id, fatura_cartao_id: fatura.id
  }, transaction });
  if (removidos !== 1) conflito('Vinculo de fatura alterado. Atualize a fila antes de tentar novamente.');
  await titulo.update({ fatura_cartao_id: null, cartao_id: null,
    atualizado_por: usuarioId }, { transaction });
  await recalcularFaturaCartao(fatura.id, { transaction, leituraCorrente: true });
  return anterior;
}

async function corrigirPrevisaoCartaoNaBaixa(req, titulo, filaId, instrumento, transaction) {
  const anterior = await desvincularPrevisaoCartao(titulo, req.user.id, transaction);
  if (!anterior) return null;
  // O evento faz parte da mesma transacao; qualquer falha na baixa/auditoria
  // restaura tambem vinculo e total antigos. Faturas e movimentos nao sao apagados.
  await SecurityEventLog.create({ usuario_id: req.user.id,
    tipo_evento: 'MANUAL_PAYMENT_CARD_FORECAST_CORRECTED', recurso_tipo: 'TITULO_FINANCEIRO',
    recurso_id: String(titulo.id), status: 'SUCCESS',
    descricao: 'Previsao de cartao corrigida ao registrar a forma efetiva na fila',
    ip_origem: getRequestIp(req), user_agent: String(req.headers?.['user-agent'] || '').slice(0, 255),
    metadata: { fila_id: filaId, anterior, instrumento_efetivo: instrumento,
      ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) }
  }, { transaction });
  return anterior;
}

module.exports = { validarPrevisaoCartaoFila, corrigirPrevisaoCartaoNaBaixa, desvincularPrevisaoCartao };
