const STATUS_TITULOS_EM_ABERTO = Object.freeze(['PREVISAO', 'ABERTO', 'PARCIAL']);

const STATUS_TITULO_FILTROS_CALCULADOS = Object.freeze([
  'EM_ABERTO',
  'VENCIDO',
  'PREVISAO_VENCIDA',
  'ABERTO_VENCIDO',
  'PARCIAL_VENCIDO'
]);

const STATUS_VENCIDO_POR_FILTRO = Object.freeze({
  VENCIDO: STATUS_TITULOS_EM_ABERTO,
  PREVISAO_VENCIDA: Object.freeze(['PREVISAO']),
  ABERTO_VENCIDO: Object.freeze(['ABERTO']),
  PARCIAL_VENCIDO: Object.freeze(['PARCIAL'])
});

function resolveTituloStatusFilter(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === 'EM_ABERTO') {
    return {
      statuses: [...STATUS_TITULOS_EM_ABERTO],
      vencido: false
    };
  }

  const overdueStatuses = STATUS_VENCIDO_POR_FILTRO[normalized];
  if (overdueStatuses) {
    return {
      statuses: [...overdueStatuses],
      vencido: true
    };
  }

  return {
    statuses: [normalized],
    vencido: false
  };
}

function resolveTituloStatusFilters(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return [...new Set(values
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean))]
    .map((item) => resolveTituloStatusFilter(item))
    .filter(Boolean);
}

module.exports = {
  STATUS_TITULO_FILTROS_CALCULADOS,
  STATUS_TITULOS_EM_ABERTO,
  resolveTituloStatusFilter,
  resolveTituloStatusFilters
};
