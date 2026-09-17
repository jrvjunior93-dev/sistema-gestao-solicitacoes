const ESCOPOS_ITEM_ORIGINAL = new Set(['ITEM', 'ITEM_APROVADO']);
const ESCOPOS_ITEM_PEDIDO = new Set(['PEDIDO_ITEM', 'ENTREGA']);

function mesmoId(a, b) {
  return Number(a) > 0 && Number(a) === Number(b);
}

export function comentariosDaEtapa(lista, escopo, referenciaId) {
  return lista.filter((comentario) => comentario.escopo === escopo
    && mesmoId(comentario.referencia_id, referenciaId));
}

export function comentariosDoItem(lista, item) {
  return lista.filter((comentario) => ESCOPOS_ITEM_ORIGINAL.has(comentario.escopo)
    && mesmoId(comentario.referencia_id, item.id)
    && comentario.item_tipo === item.item_tipo);
}

export function comentariosDoItemPedido(lista, item) {
  const origemId = item.solicitacao_compra_item_id || item.solicitacao_compra_item_manual_id;
  const origemTipo = item.solicitacao_compra_item_id ? 'CADASTRADO' : 'MANUAL';
  return lista.filter((comentario) => (
    ESCOPOS_ITEM_PEDIDO.has(comentario.escopo)
      && mesmoId(comentario.referencia_id, item.id)
  ) || (
    ESCOPOS_ITEM_ORIGINAL.has(comentario.escopo)
      && mesmoId(comentario.referencia_id, origemId)
      && comentario.item_tipo === origemTipo
  ));
}
