const ESCOPOS_ITEM_ORIGINAL = new Set(['ITEM', 'ITEM_APROVADO']);
const ESCOPOS_ITEM_PEDIDO = new Set(['PEDIDO_ITEM', 'ENTREGA']);

function mesmoId(a, b) {
  return Number(a) > 0 && Number(a) === Number(b);
}

export function comentariosDaEtapa(lista, escopo, referenciaId) {
  return lista.filter((comentario) => comentario.escopo === escopo
    && mesmoId(comentario.referencia_id, referenciaId));
}

function idsItensPedidoDaOrigem(pedidos, origemId, origemTipo) {
  const campoOrigem = origemTipo === 'MANUAL'
    ? 'solicitacao_compra_item_manual_id' : 'solicitacao_compra_item_id';
  return new Set(pedidos.flatMap((pedido) => pedido.itens || [])
    .filter((item) => mesmoId(item[campoOrigem], origemId))
    .map((item) => Number(item.id)));
}

function comentariosVinculados(lista, origemId, origemTipo, idsPedido) {
  return lista.filter((comentario) => (
    ESCOPOS_ITEM_ORIGINAL.has(comentario.escopo)
      && mesmoId(comentario.referencia_id, origemId)
      && comentario.item_tipo === origemTipo
  ) || (
    ESCOPOS_ITEM_PEDIDO.has(comentario.escopo)
      && idsPedido.has(Number(comentario.referencia_id))
  ));
}

export function comentariosDoItem(lista, item, pedidos = []) {
  return comentariosVinculados(lista, item.id, item.item_tipo,
    idsItensPedidoDaOrigem(pedidos, item.id, item.item_tipo));
}

export function comentariosDoItemPedido(lista, item, pedidos = []) {
  const origemId = item.solicitacao_compra_item_id || item.solicitacao_compra_item_manual_id;
  const origemTipo = item.solicitacao_compra_item_id ? 'CADASTRADO' : 'MANUAL';
  const idsPedido = idsItensPedidoDaOrigem(pedidos, origemId, origemTipo);
  idsPedido.add(Number(item.id));
  return comentariosVinculados(lista, origemId, origemTipo, idsPedido);
}
