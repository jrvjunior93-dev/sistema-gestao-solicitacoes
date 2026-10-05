// A solicitacao comum ainda nao tem fornecedor, preco ou frete definidos.
// Montar explicitamente os campos aceitos tambem corrige rascunhos antigos.
export function prepararPayloadSolicitacaoCompra(payload = {}) {
  const { obra_id, necessario_para, observacoes, link_geral, itens } = payload;

  return {
    obra_id,
    necessario_para,
    observacoes,
    link_geral,
    itens: Array.isArray(itens)
      ? itens.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
          const { valor_unitario, valor_total, frete_valor, ...itemSolicitado } = item;
          return itemSolicitado;
        })
      : itens
  };
}
