export function normalizarSetorToken(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

export function isGeoSetor(valor) {
  const token = normalizarSetorToken(valor);
  return token === 'GEO' || token === 'GERENCIA_DE_PROCESSOS' || token === 'GERENCIA_PROCESSOS';
}

export function obterTokensSetorUsuario(user) {
  return [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ].filter(Boolean);
}
