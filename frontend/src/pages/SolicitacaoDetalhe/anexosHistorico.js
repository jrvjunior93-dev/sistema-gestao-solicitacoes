export function metadataAnexoHistorico(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

function caminhos(h) {
  const m = metadataAnexoHistorico(h?.metadata);
  return [m.caminho, m.caminho_arquivo, m.arquivo_url, m.url, m.file_url,
    m.download_url, m.comprovante_pdf_url].filter(Boolean).map(c => {
    const valor = String(c).split('?')[0].split('#')[0];
    try { return decodeURI(valor); } catch { return valor; }
  });
}

export function anexoHistoricoRemovido(h, historicos = []) {
  const m = metadataAnexoHistorico(h?.metadata);
  if (h?.acao === 'ANEXO_REMOVIDO' || m.removido === true || m.removido_em) return true;
  return (Array.isArray(historicos) ? historicos : []).some(r => {
    if (String(r?.acao || '').toUpperCase() !== 'ANEXO_REMOVIDO') return false;
    if (Number(r.solicitacao_id) !== Number(h.solicitacao_id)) return false;
    const rm = metadataAnexoHistorico(r.metadata);
    if (rm.historico_id && Number(rm.historico_id) === Number(h.id)) return true;
    if (m.anexo_id && rm.anexo_id) return Number(m.anexo_id) === Number(rm.anexo_id);
    if (h.createdAt && r.createdAt && new Date(r.createdAt).getTime() < new Date(h.createdAt).getTime()) return false;
    const originais = caminhos(h);
    return caminhos(r).some(c => originais.includes(c));
  });
}
