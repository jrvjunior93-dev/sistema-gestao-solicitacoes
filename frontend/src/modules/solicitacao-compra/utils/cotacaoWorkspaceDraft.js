// Somente campos digitados. URLs, arquivos, tokens, permissoes e saldos
// nunca substituem a consulta autorizada ao restaurar uma resposta interna.
const campos = ['nova_oferta_saldo', 'valor_minimo_pedido', 'desconto_total',
  'condicao_pagamento', 'prazo_entrega', 'prazo_entrega_dias', 'prazo_entrega_tipo',
  'difal_valor', 'frete_tipo', 'frete_modo', 'frete_valor', 'frete_data_vencimento',
  'frete_transportador_nome', 'frete_transportador_cpf_cnpj', 'observacao_resposta'];
const camposItem = ['item_tipo', 'item_referencia_id', 'status_disponibilidade',
  'preco', 'quantidade_solicitada', 'quantidade_minima_item', 'quantidade_disponivel',
  'ipi_valor', 'icms_valor', 'st_valor', 'frete_valor', 'observacao'];
const selecionar = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key]]));
const itemKey = item => `${item.item_tipo}:${item.item_referencia_id}`;

export function camposRespostaDraft(form) {
  return { ...selecionar(form, campos), itens: (form?.itens || []).map(item => selecionar(item, camposItem)) };
}

export function revisaoRespostaDraft(cotacao, base) {
  return JSON.stringify([cotacao.id, cotacao.status, camposRespostaDraft(base),
    (base.itens || []).map(item => [itemKey(item), item.quantidade_original,
      item.saldo_solicitacao, item.quantidade_ja_comprada_fornecedor])]);
}

export function restaurarRespostaDraft(base, draft) {
  const itens = new Map((draft?.itens || []).map(item => [itemKey(item), item]));
  return { ...base, ...selecionar(draft, campos),
    itens: base.itens.map(item => ({ ...item, ...itens.get(itemKey(item)) })) };
}

export function revisaoComparativoDraft(solicitacao, comparativo) {
  return JSON.stringify([solicitacao?.status, (comparativo?.itens || []).map(item =>
    [item.item_tipo, item.item_referencia_id, item.quantidade, item.saldo_disponivel,
      (item.respostas || []).map(resposta => [resposta.resposta_item_id, resposta.disponivel,
        resposta.preco, resposta.quantidade_disponivel, resposta.saldo_disponivel_fornecedor,
        resposta.ipi_valor, resposta.icms_valor, resposta.st_valor, resposta.frete_item_valor])])]);
}
