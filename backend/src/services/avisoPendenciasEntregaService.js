'use strict';

// Apenas apresentacao: as guardas continuam decidindo quais itens bloqueiam.
function agruparPendenciasEntrega(pendencias) {
  const grupos = new Map();
  for (const linha of pendencias) {
    const id = Number(linha.solicitacao_id) || null;
    const pedidoId = Number(linha.pedido_id) || null;
    const chave = id ? `sol:${id}` : `pedido:${pedidoId}`;
    if (!grupos.has(chave)) grupos.set(chave, {
      solicitacao_id: id, codigo: linha.solicitacao_codigo || linha.codigo || null,
      pedidos: new Set(), itens: new Set()
    });
    const grupo = grupos.get(chave);
    if (pedidoId) grupo.pedidos.add(pedidoId);
    grupo.itens.add(linha.item_id || linha.id || linha);
  }
  return [...grupos.values()].map(({ itens, pedidos, ...grupo }) => ({
    ...grupo, pedidos: [...pedidos].sort((a, b) => a - b), itens_pendentes: itens.size
  }));
}

module.exports = { agruparPendenciasEntrega };
