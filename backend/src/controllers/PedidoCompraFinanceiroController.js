const { PedidoCompra } = require('../models');
const {
  adotarPedidoLegado,
  criarPrevisoesPedido,
  decidirReaberturaGeo,
  liberarTitulosPedido,
  obterResumoFinanceiroPedido,
  reparcelarPrevisoesPedido,
  registrarDocumentoFinanceiro,
  solicitarReaberturaGeo
} = require('../services/pedidoCompraFinanceiroService');
const { responderErroController } = require('../utils/controllerError');

function chaveIdempotencia(req) {
  return String(req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || '').trim();
}

async function executarComTransacao(req, res, operacao, mensagemErro, status = 200) {
  const transaction = await PedidoCompra.sequelize.transaction();
  try {
    const resultado = await operacao(transaction);
    await transaction.commit();
    return res.status(status).json(resultado);
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return responderErroController(res, error, mensagemErro, { status: 400 });
  }
}

module.exports = {
  async adotarLegado(req, res) {
    return executarComTransacao(req, res, async (transaction) => {
      const pedido = await adotarPedidoLegado({
        pedidoId: req.params.id,
        usuarioId: req.user.id,
        transaction
      });
      return obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes: true });
    }, 'Erro ao iniciar a gestao financeira do pedido');
  },

  async criarPrevisoes(req, res) {
    return executarComTransacao(req, res, (transaction) => criarPrevisoesPedido({
      req,
      pedidoId: req.params.id,
      payload: req.body,
      idempotencyKey: chaveIdempotencia(req),
      transaction
    }), 'Erro ao criar as previsoes financeiras do pedido', 201);
  },

  async reparcelarPrevisoes(req, res) {
    return executarComTransacao(req, res, (transaction) => reparcelarPrevisoesPedido({
      req,
      pedidoId: req.params.id,
      payload: req.body,
      idempotencyKey: chaveIdempotencia(req),
      transaction
    }), 'Erro ao alterar as parcelas das previsoes financeiras do pedido');
  },

  async registrarDocumento(req, res) {
    return executarComTransacao(req, res, (transaction) => registrarDocumentoFinanceiro({
      pedidoId: req.params.id,
      payload: req.body,
      usuarioId: req.user.id,
      idempotencyKey: chaveIdempotencia(req),
      transaction
    }), 'Erro ao registrar o documento financeiro do pedido', 201);
  },

  async liberarTitulos(req, res) {
    return executarComTransacao(req, res, (transaction) => liberarTitulosPedido({
      pedidoId: req.params.id,
      tituloIds: req.body.titulo_ids,
      formaPagamentoId: req.body.forma_pagamento_id,
      usuarioId: req.user.id,
      transaction
    }), 'Erro ao liberar os titulos do pedido');
  },

  async solicitarReabertura(req, res) {
    return executarComTransacao(req, res, (transaction) => solicitarReaberturaGeo({
      pedidoId: req.params.id,
      motivo: req.body.motivo,
      usuarioId: req.user.id,
      idempotencyKey: chaveIdempotencia(req),
      transaction
    }), 'Erro ao solicitar a reabertura do pedido', 201);
  },

  async decidirReabertura(req, res) {
    return executarComTransacao(req, res, (transaction) => decidirReaberturaGeo({
      pedidoId: req.params.id,
      reaberturaId: req.params.reaberturaId,
      decisao: req.body.decisao,
      motivo: req.body.motivo,
      usuarioId: req.user.id,
      transaction
    }), 'Erro ao decidir a reabertura do pedido');
  }
};
