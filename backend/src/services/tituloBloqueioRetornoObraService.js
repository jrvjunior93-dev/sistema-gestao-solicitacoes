'use strict';

const { Op } = require('sequelize');
const {
  Contrato,
  ContratoParcela,
  SolicitacaoPedidoRetorno,
  SolicitacaoRecargaCartao,
  TituloFinanceiro
} = require('../models');
const {
  MENSAGEM_PADRAO,
  assertTituloDisponivelParaBaixa,
  ehPedidoObraParaSolicitacaoNoFinanceiro,
  tituloEstaBloqueado
} = require('./tituloBloqueioRetornoObraPolicy');

const STATUS_TITULOS_BLOQUEAVEIS = ['PREVISAO', 'ABERTO', 'PARCIAL'];

async function obterIdsTitulosVinculadosSolicitacao(solicitacaoId, { transaction = null } = {}) {
  const id = Number(solicitacaoId);
  if (!Number.isInteger(id) || id <= 0) return [];

  const [titulosDiretos, contratos, recargas] = await Promise.all([
    TituloFinanceiro.findAll({
      where: { solicitacao_id: id },
      attributes: ['id'],
      transaction
    }),
    Contrato.findAll({
      where: { solicitacao_id: id },
      attributes: ['id'],
      transaction
    }),
    SolicitacaoRecargaCartao.findAll({
      where: { solicitacao_id: id },
      attributes: ['titulo_financeiro_id'],
      transaction
    })
  ]);

  const contratoIds = contratos.map((item) => Number(item.id)).filter(Boolean);
  const parcelas = contratoIds.length
    ? await ContratoParcela.findAll({
      where: {
        contrato_id: { [Op.in]: contratoIds },
        titulo_financeiro_id: { [Op.ne]: null }
      },
      attributes: ['titulo_financeiro_id'],
      transaction
    })
    : [];

  return [...new Set([
    ...titulosDiretos.map((item) => Number(item.id)),
    ...parcelas.map((item) => Number(item.titulo_financeiro_id)),
    ...recargas.map((item) => Number(item.titulo_financeiro_id))
  ].filter(Boolean))];
}

async function bloquearTitulosVinculados({ solicitacaoId, pedido, transaction = null }) {
  if (!ehPedidoObraParaSolicitacaoNoFinanceiro(pedido)) return 0;
  const tituloIds = await obterIdsTitulosVinculadosSolicitacao(solicitacaoId, { transaction });
  if (!tituloIds.length) return 0;

  const motivo = `Baixa bloqueada: a Obra solicitou o retorno da solicitacao para correcao (pedido #${pedido.id}).`;
  const [quantidade] = await TituloFinanceiro.update({
    bloqueado_retorno_obra: true,
    bloqueio_retorno_pedido_id: pedido.id,
    bloqueio_retorno_motivo: motivo,
    bloqueio_retorno_em: pedido.createdAt || new Date()
  }, {
    where: {
      id: { [Op.in]: tituloIds },
      status: { [Op.in]: STATUS_TITULOS_BLOQUEAVEIS }
    },
    transaction
  });
  return Number(quantidade || 0);
}

async function desbloquearTitulosVinculados({ solicitacaoId, pedidoId = null, transaction = null }) {
  const tituloIds = await obterIdsTitulosVinculadosSolicitacao(solicitacaoId, { transaction });
  if (!tituloIds.length) return 0;
  const where = { id: { [Op.in]: tituloIds }, bloqueado_retorno_obra: true };
  if (pedidoId) where.bloqueio_retorno_pedido_id = Number(pedidoId);

  const [quantidade] = await TituloFinanceiro.update({
    bloqueado_retorno_obra: false,
    bloqueio_retorno_pedido_id: null,
    bloqueio_retorno_motivo: null,
    bloqueio_retorno_em: null
  }, { where, transaction });
  return Number(quantidade || 0);
}

async function sincronizarAposEncerramentoPedido({ solicitacaoId, pedidoId, transaction = null }) {
  const pendentes = await SolicitacaoPedidoRetorno.findAll({
    where: { solicitacao_id: Number(solicitacaoId), status: 'PENDENTE' },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const outroPedido = pendentes.find(ehPedidoObraParaSolicitacaoNoFinanceiro);
  if (outroPedido) {
    return bloquearTitulosVinculados({ solicitacaoId, pedido: outroPedido, transaction });
  }
  return desbloquearTitulosVinculados({ solicitacaoId, pedidoId, transaction });
}

module.exports = {
  MENSAGEM_PADRAO,
  assertTituloDisponivelParaBaixa,
  bloquearTitulosVinculados,
  desbloquearTitulosVinculados,
  ehPedidoObraParaSolicitacaoNoFinanceiro,
  obterIdsTitulosVinculadosSolicitacao,
  sincronizarAposEncerramentoPedido,
  tituloEstaBloqueado
};
