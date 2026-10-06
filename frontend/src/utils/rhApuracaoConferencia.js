export function camposAlterados(anterior, atual) {
  return Object.fromEntries(Object.entries(atual).filter(([key, value]) => {
    if (key.startsWith('ajuste_')) return Number(value || 0) !== Number(anterior[key] || 0);
    return String(value ?? '') !== String(anterior[key] ?? '');
  }));
}

export function progressoConferencia(itens = [], edicoes = {}, estados = {}) {
  const conferidos = itens.filter((item) => item.status === 'CONFERIDO'
    && edicoes[item.id]?.status !== 'PENDENTE' && !['pendente', 'salvando', 'erro'].includes(estados[item.id])).length;
  const gravacoesPendentes = Object.values(estados).some((estado) => ['pendente', 'salvando', 'erro'].includes(estado));
  return { conferidos, total: itens.length, pendentes: itens.length - conferidos,
    pronto: itens.length > 0 && conferidos === itens.length && !gravacoesPendentes, gravacoesPendentes };
}
