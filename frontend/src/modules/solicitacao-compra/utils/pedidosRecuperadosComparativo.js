const positivo = v => Number.isSafeInteger(Number(v)) && Number(v) > 0;
export function chaveItemRecuperado(item, atual = false) {
  const tipo = String(item?.item_tipo || '').toUpperCase();
  const id = atual ? (item?.item_referencia_id ?? item?.id) : tipo === 'MANUAL' ? item?.solicitacao_compra_item_manual_id : item?.solicitacao_compra_item_id;
  return ['MANUAL', 'CADASTRADO'].includes(tipo) && positivo(id) ? `${tipo}:${Number(id)}` : null;
}
// Somente IDs de origem persistidos. Resposta atual, descricao ou fornecedor
// nao identificam a versao antiga de um item sobrescrito.
export function organizarPedidosRecuperados(comparativo) {
  const atuais = new Set((comparativo?.itens || []).map(i => chaveItemRecuperado(i, true)).filter(Boolean));
  const pedidos = (comparativo?.pedidos_recuperados || []).filter(p => positivo(p.pedido_id));
  const porPedidoItem = new Map(), semItemAtual = [];
  for (const pedido of pedidos) for (const item of pedido.itens || []) {
    const chave = chaveItemRecuperado(item);
    if (!chave || !atuais.has(chave)) { semItemAtual.push({ pedido, item }); continue; }
    const key = `${pedido.pedido_id}:${chave}`;
    porPedidoItem.set(key, [...(porPedidoItem.get(key) || []), item]);
  }
  return { pedidos, porPedidoItem, semItemAtual };
}
export function itensDoPedidoRecuperado(historico, pedido, item) {
  return historico.porPedidoItem.get(`${pedido.pedido_id}:${chaveItemRecuperado(item, true)}`) || [];
}
