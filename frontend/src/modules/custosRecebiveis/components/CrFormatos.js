/*
  Formatos comuns das visões do administrador (reforma 29/09/2026, Fase 4).
  Horário sempre de Brasília: é o relógio dos prazos do módulo.
*/
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
});

export function formatarDataHora(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

export function rotuloObra(obra, fallbackId = null) {
  if (!obra && !fallbackId) return '—';
  const codigo = obra?.codigo || obra?.id || fallbackId;
  return obra?.nome ? `${codigo} · ${obra.nome}` : `Obra ${codigo}`;
}

export function normalizarBusca(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}
