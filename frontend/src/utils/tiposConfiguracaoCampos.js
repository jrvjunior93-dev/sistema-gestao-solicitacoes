import { normalizarAreaNovaSolicitacao } from './novaSolicitacaoCampos.js';

export function ehAreaGeoConfiguracaoCampos(area, listaSetores = []) {
  const areaKey = normalizarAreaNovaSolicitacao(area);
  const setorSelecionado = (Array.isArray(listaSetores) ? listaSetores : []).find((setor) => (
    normalizarAreaNovaSolicitacao(setor?.codigo) === areaKey
  ));
  const tokens = [areaKey, setorSelecionado?.codigo, setorSelecionado?.nome]
    .map((valor) => normalizarAreaNovaSolicitacao(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_'));

  return Number(setorSelecionado?.eh_setor_geo) === 1
    || tokens.some((token) => ['GEO', 'GERENCIA_DE_PROCESSOS'].includes(token));
}

// Catalogo administrativo de campos, nao autorizacao ou disponibilidade de tipos na obra.
export function filtrarTiposPorArea(listaTipos, regrasTiposPorSetor, area, listaSetores = []) {
  const tiposAtivos = Array.isArray(listaTipos)
    ? listaTipos.filter((tipo) => tipo?.ativo !== false)
    : [];

  // A abertura pela obra entra em GEO independentemente do setor de origem do tipo.
  // Por isso todos os tipos ativos precisam poder ter uma regra de campos em GEO.
  if (ehAreaGeoConfiguracaoCampos(area, listaSetores)) return tiposAtivos;

  const areaKey = normalizarAreaNovaSolicitacao(area);
  const tiposPermitidos = Array.isArray(regrasTiposPorSetor?.[areaKey]?.tipos)
    ? regrasTiposPorSetor[areaKey].tipos.map(Number).filter(Number.isFinite)
    : [];
  if (tiposPermitidos.length === 0) return tiposAtivos;

  const idsPermitidos = new Set(tiposPermitidos);
  return tiposAtivos.filter((tipo) => idsPermitidos.has(Number(tipo.id)));
}
