// A empresa da conta pagadora não substitui os devedores econômicos do título.
export function empresasDevedorasTitulo(titulo) {
  const ids = titulo?.compartilhamento_id
    ? (titulo.participacoes || []).map(p => p.empresa_id)
    : [titulo?.empresa_id || titulo?.empresa?.id || titulo?.obra?.empresa_id || titulo?.obra?.empresa?.id];
  return [...new Set(ids.filter(id => Number.isSafeInteger(Number(id)) && Number(id) > 0).map(String))];
}

export function tituloTemOutraDevedora(titulo, pagadoraId) {
  return Boolean(pagadoraId) && empresasDevedorasTitulo(titulo).some(id => id !== String(pagadoraId));
}
