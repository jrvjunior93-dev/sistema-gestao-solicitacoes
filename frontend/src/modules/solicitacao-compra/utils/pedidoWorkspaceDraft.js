// Assinaturas de conflito, nunca DTOs restaurados como fonte de autoridade.
export const revisaoItemPedido = (pedido, item) => JSON.stringify([
  pedido?.id, pedido?.status, pedido?.edicao_bloqueada, item?.id, item?.removido,
  item?.quantidade_pedido, item?.preco_unitario, item?.observacoes,
  item?.quantidade_disponivel_remanejamento
]);
export const revisaoFretesPedido = pedido => JSON.stringify([
  pedido?.id, pedido?.status, pedido?.edicao_bloqueada,
  (pedido?.itens || []).map(item => [item.id, item.removido, item.quantidade_pedido, item.preco_unitario]),
  (pedido?.fretes || []).map(frete => [frete.id, frete.status_financeiro, frete.valor_total,
    frete.titulo_financeiro_id, frete.tituloFinanceiro?.id, frete.updatedAt,
    frete.tipo, frete.momento, frete.criterio_rateio, frete.data_vencimento,
    frete.fornecedor_compra_id, frete.parceiro_id, frete.observacoes,
    frete.dados_pagamento,
    (frete.rateios || []).map(rateio => [rateio.pedido_compra_item_id, rateio.valor_rateado])])
]);
export const revisaoRemanejoPedido = (pedido, item) => JSON.stringify([
  revisaoItemPedido(pedido, item),
  (pedido?.candidatos_remanejamento || []).map(candidato => [candidato.resposta_item_id,
    candidato.fornecedor_id, candidato.saldo_disponivel_fornecedor, candidato.preco_unitario])
]);
