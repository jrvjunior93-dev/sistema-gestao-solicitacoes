// Apresentacao do snapshot: nao modifica o dossie assinado nem sua descricao.
export function motivosAjusteAutorizacao(lot = {}) {
  return (lot.itens || []).filter(item => ['REJEITADO', 'INVALIDADO'].includes(item.status) && String(item.motivo_decisao || '').trim())
    .map(item => ({ id: item.id, motivo: item.motivo_decisao,
      referencia: [item.snapshot_json?.solicitacao?.codigo, item.snapshot_json?.codigo].filter(Boolean).join(' · ') || `Título #${item.snapshot_json?.titulo_id || item.titulo_financeiro_id || item.id}` }));
}

// Alias de exibicao para legados: nao altera codigo persistido, anexos ou hash.
export function codigoLoteAutorizacao(lot = {}) {
  const id = Number(lot.id);
  return Number.isSafeInteger(id) && id > 0 ? `LOTE-${id}` : String(lot.codigo || '-');
}

export function resumoSolicitacaoAutorizacao(snapshot = {}) {
  const descriptions = [snapshot.solicitacao?.descricao, snapshot.descricao];
  for (const description of descriptions) {
    const normalized = String(description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, ' ').trim();
    // Descricoes legadas de titulos podem iniciar com Forma N e SOL-N.
    const type = normalized.match(/^(?:Forma\s+\d+\s*-\s*)?(?:SOL-\d+\s*-\s*)?(Solicitacao\s+de\s+Compra|Compra\s+Direta)\b/i)?.[1];
    if (type) return /^Compra/i.test(type) ? 'Compra Direta' : 'Solicitação de Compra';
  }
  return String(snapshot.descricao || '')
    .replace(/\s*valor total\s*:\s*r\$\s*[\d.]+(?:,\d{1,2})?/gi, '').trim();
}
