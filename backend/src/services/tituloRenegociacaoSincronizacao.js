'use strict';
const { Op, literal } = require('sequelize');
const db = require('../models');

async function sincronizarOrigens(ids, { transaction, usuarioId = null } = {}) {
  if (!transaction) throw new Error('A sincronização da negociação exige uma transação.');
  ids = [...new Set(ids.map(Number).filter(Boolean))].sort((a, b) => a - b);
  if (!ids.length) return;
  const origens = await db.TituloFinanceiro.findAll({
    where: { id: { [Op.in]: [...new Set(ids)].sort((a, b) => a - b) } }, transaction,
    order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE
  });
  const pedidos = await db.PedidoCompraTitulo.findAll({
    where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction
  });
  const fretes = await db.PedidoCompraFrete.findAll({
    where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction
  });
  const alocacoes = await db.SolicitacaoCompraAlocacao.findAll({
    where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction
  });
  const efetivos = await require('./tituloRenegociacaoVinculos').projetarOrigens(origens, { transaction });
  const porOrigem = new Map(efetivos.map(t => [Number(t.id), t]));
  // Alocações legadas podem não ter pedido. Não modificar outras alocações da
  // mesma SC nem apagar titulo_financeiro_id: ele é a trilha para o acordo.
  for (const alocacao of alocacoes.filter(a => !a.pedido_compra_id && a.status === 'ATIVA')) {
    const realizado = porOrigem.get(Number(alocacao.titulo_financeiro_id))?.status === 'QUITADO';
    await db.SolicitacaoCompraAlocacao.update({
      status_financeiro: realizado ? 'REALIZADO' : 'PREVISTO',
      valor_realizado: realizado ? literal('valor_total') : 0,
      realizado_em: realizado ? new Date() : null
    }, { where: { id: alocacao.id, status: 'ATIVA' }, transaction });
  }
  const pedidoIds = [...new Set([...pedidos, ...fretes, ...alocacoes].map(p => Number(p.pedido_compra_id)).filter(Boolean))]
    .sort((a, b) => a - b);
  const financeiroPedido = require('./pedidoCompraFinanceiroService');
  await financeiroPedido.sincronizarStatusFinanceiroPedidos(pedidoIds, transaction);
  for (const pedidoId of pedidoIds) {
    const pedido = await db.PedidoCompra.findByPk(pedidoId, { transaction });
    const realizado = pedido?.status_financeiro === financeiroPedido.STATUS_FLUXO.CONCLUIDO;
    await db.SolicitacaoCompraAlocacao.update({
      status_financeiro: realizado ? 'REALIZADO' : 'PREVISTO',
      valor_realizado: realizado ? literal('valor_total') : 0,
      realizado_em: realizado ? new Date() : null
    }, { where: { pedido_compra_id: pedidoId, status: 'ATIVA' }, transaction });
  }
  // Sem alterar a data original da parcela comercial nem os documentos assinados.
  for (const origem of origens) {
    await require('./comercialService').sincronizarContratoComercialPorTituloEditado({
      tituloId: origem.id, usuarioId, transaction
    });
  }
  const parcelasContrato = await db.ContratoParcela.findAll({
    where: { titulo_financeiro_id: { [Op.in]: ids } }, attributes: ['contrato_id'], transaction
  });
  const contratos = parcelasContrato.length ? await db.Contrato.findAll({
    where: { id: { [Op.in]: [...new Set(parcelasContrato.map(p => p.contrato_id))] } },
    attributes: ['id', 'solicitacao_id'], transaction
  }) : [];
  const scIds = [...new Set(alocacoes.concat(fretes).map(a => Number(a.solicitacao_compra_id)).filter(Boolean))];
  if (pedidoIds.length) {
    const pedidosVinculados = await db.PedidoCompra.findAll({
      where: { id: { [Op.in]: pedidoIds } }, attributes: ['solicitacao_compra_id'], transaction
    });
    scIds.push(...pedidosVinculados.map(p => Number(p.solicitacao_compra_id)).filter(Boolean));
  }
  const compras = scIds.length ? await db.SolicitacaoCompra.findAll({
    where: { id: { [Op.in]: [...new Set(scIds)] } }, attributes: ['solicitacao_principal_id'], transaction
  }) : [];
  const solicitacoes = [...new Set([...origens, ...contratos, ...fretes].map(t => Number(t.solicitacao_id))
    .concat(compras.map(s => Number(s.solicitacao_principal_id))).filter(Boolean))].sort((a, b) => a - b);
  for (const solicitacaoId of solicitacoes) {
    await require('./solicitacaoFinanceiroStatusService').sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId, usuarioId, setor: 'FINANCEIRO', transaction,
      observacao: 'Situação financeira atualizada pelas parcelas da negociação vinculada.'
    });
  }
}

async function aposAtualizarTitulo(titulo, options) {
  if (options.adiarSincronizacaoRenegociacao) return;
  if (!titulo.renegociacao_id || !['valor_baixado', 'valor_saldo', 'status'].some(k => titulo.changed(k))) return;
  await sincronizarDestinos([titulo.id], { transaction: options.transaction, usuarioId: titulo.atualizado_por });
}

async function sincronizarDestinos(ids, options) {
  const alocacoes = await db.TituloRenegociacaoAlocacao.findAll({
    where: { titulo_destino_id: { [Op.in]: ids } }, transaction: options.transaction
  });
  await sincronizarOrigens(alocacoes.map(a => a.titulo_origem_id), options);
}

module.exports = { sincronizarOrigens, aposAtualizarTitulo, sincronizarDestinos };
