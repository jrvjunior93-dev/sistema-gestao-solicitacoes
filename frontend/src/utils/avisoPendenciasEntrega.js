// Detalhes tipados, separados da mensagem curta (que tem limite de tamanho).
// Mantem compatibilidade com respostas antigas sem a lista.
export function opcoesAvisoPendenciasEntrega(error) {
  const payload = error?.data || error;
  if (payload?.code !== 'COMPRA_ENTREGA_PENDENTE') return undefined;
  const solicitacoes = payload.details?.solicitacoes;
  if (!Array.isArray(solicitacoes)) return undefined;
  const itens = solicitacoes.filter((s) => s && typeof s === 'object').map((s) => {
    const pedidos = Array.isArray(s.pedidos) ? s.pedidos.filter((id) => Number.isSafeInteger(id) && id > 0) : [];
    const codigo = typeof s.codigo === 'string' ? s.codigo.trim() : '';
    const referencia = codigo || (pedidos.length ? 'Solicitação sem código' : 'Solicitação não identificada');
    const quantidade = Number(s.itens_pendentes) || 0;
    return `${referencia}${pedidos.length ? ` · Pedido${pedidos.length > 1 ? 's' : ''} ${pedidos.map((id) => `#${id}`).join(', ')}` : ''} · ${quantidade} ${quantidade === 1 ? 'item pendente' : 'itens pendentes'}`;
  });
  return itens.length ? { itens } : undefined;
}
