const { Op } = require('sequelize');
const { money } = require('../utils/decimalCompras');
const {
  PedidoCompra,
  PedidoCompraFrete,
  PedidoCompraFreteRateio,
  PedidoCompraItem,
  Solicitacao,
  SolicitacaoCompra
} = require('../models');

function asNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return money(value);
}

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase();
}

async function sincronizarValoresSolicitacaoCompra(solicitacaoId, transaction) {
  const solicitacao = await SolicitacaoCompra.findByPk(Number(solicitacaoId), {
    transaction,
    attributes: ['id', 'solicitacao_principal_id']
  });
  if (!solicitacao) return null;

  const pedidos = await PedidoCompra.findAll({
    where: {
      solicitacao_compra_id: solicitacao.id,
      [Op.or]: [
        { status: null },
        { status: { [Op.ne]: 'CANCELADO' } }
      ]
    },
    transaction,
    attributes: ['id', 'valor_total', 'valor_total_fornecedor']
  });
  const valorAquisicao = roundMoney(pedidos.reduce((sum, pedido) => sum + asNumber(pedido.valor_total), 0));
  const valorFornecedor = roundMoney(pedidos.reduce(
    (sum, pedido) => sum + asNumber(pedido.valor_total_fornecedor),
    0
  ));

  await SolicitacaoCompra.update(
    { valor_fechado: valorAquisicao },
    { where: { id: solicitacao.id }, transaction }
  );
  if (Number(solicitacao.solicitacao_principal_id || 0) > 0) {
    await Solicitacao.update(
      { valor: valorFornecedor },
      { where: { id: solicitacao.solicitacao_principal_id }, transaction }
    );
  }

  return { valor_aquisicao: valorAquisicao, valor_fornecedor: valorFornecedor };
}

async function sincronizarTotaisFretePedido(pedidoId, transaction) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [{ model: PedidoCompraItem, as: 'itens' }],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!pedido) throw new Error('Pedido de compra nao encontrado para recalcular os totais.');

  const itensAtivos = (pedido.itens || []).filter((item) => !item.removido);
  const fretes = await PedidoCompraFrete.findAll({
    where: {
      pedido_compra_id: pedido.id,
      [Op.or]: [
        { status_financeiro: null },
        { status_financeiro: { [Op.ne]: 'CANCELADO' } }
      ]
    },
    include: [{ model: PedidoCompraFreteRateio, as: 'rateios', required: false }],
    transaction
  });

  const fretePorItem = new Map();
  for (const frete of fretes) {
    for (const rateio of frete.rateios || []) {
      const itemId = Number(rateio.pedido_compra_item_id || 0);
      fretePorItem.set(itemId, roundMoney((fretePorItem.get(itemId) || 0) + asNumber(rateio.valor_rateado)));
    }
  }
  for (const item of itensAtivos) {
    const freteRateado = fretePorItem.get(Number(item.id)) || 0;
    if (roundMoney(item.frete_rateado) !== freteRateado) {
      await item.update({ frete_rateado: freteRateado }, { transaction });
    }
  }

  const valorItens = roundMoney(itensAtivos.reduce((sum, item) => sum + asNumber(item.valor_total), 0));
  const freteTotal = roundMoney(fretes.reduce((sum, frete) => sum + asNumber(frete.valor_total), 0));
  const freteFornecedor = roundMoney(fretes.reduce(
    (sum, frete) => sum + (normalizeToken(frete.tipo) === 'EMBUTIDO' ? asNumber(frete.valor_total) : 0),
    0
  ));
  const valorTotal = roundMoney(valorItens + freteTotal);
  const valorTotalFornecedor = roundMoney(valorItens + freteFornecedor);

  await pedido.update({
    frete_total: freteTotal,
    valor_total: valorTotal,
    valor_total_fornecedor: valorTotalFornecedor
  }, { transaction });

  await sincronizarValoresSolicitacaoCompra(pedido.solicitacao_compra_id, transaction);
  return {
    valor_itens: valorItens,
    frete_total: freteTotal,
    valor_total: valorTotal,
    valor_total_fornecedor: valorTotalFornecedor
  };
}

module.exports = {
  sincronizarTotaisFretePedido,
  sincronizarValoresSolicitacaoCompra
};
