export const SITUACOES_AUTORIZACAO = [
  ['AGUARDANDO', 'Aguardando aprovação'], ['QUITADO', 'Quitados'],
  ['PARCIALMENTE_PAGO', 'Parcialmente pago'], ['NAO_PAGO', 'Não pago'], ['NA_FILA', 'Na fila'],
  ['REJEITADO', 'Rejeitados'], ['INVALIDADO', 'Invalidados'], ['CANCELADO', 'Cancelados'],
  ['ESTORNADO', 'Estornados'], ['RENEGOCIADO', 'Renegociados'], ['PREVISAO', 'Previsões'],
  ['AUTORIZADO', 'Autorizados — aguardando envio'],
  ['PENDENTE_FINANCEIRO', 'Pendente no financeiro'], ['INDISPONIVEL', 'Indisponíveis']
];
export const rotuloSituacao = value => ({ AGUARDANDO: 'Aguardando aprovação', QUITADO: 'Quitado',
  PARCIALMENTE_PAGO: 'Parcialmente pago', NAO_PAGO: 'Não pago', NA_FILA: 'Na fila', CONCLUIDO: 'Na fila',
  PENDENTE: 'Aguardando aprovação', ENFILEIRADO: 'Na fila', AUTORIZADO: 'Autorizado — aguardando envio',
  PREVISAO: 'Previsão', INDISPONIVEL: 'Indisponível', MISTO: 'Situações diferentes',
  PENDENTE_FINANCEIRO: 'Pendente no financeiro'
}[value] || String(value || '').replaceAll('_', ' '));
export function podeSelecionarAutorizacao(item) {
  return item.status === 'PENDENTE'
    && item.lote?.status === 'AGUARDANDO' && item.titulo && ['ABERTO', 'PARCIAL'].includes(item.titulo.status)
    && !item.titulo.renegociado_por_id && Number(item.titulo.valor_saldo) > 0
    && Math.abs(Number(item.titulo.valor_saldo) - Number(item.snapshot_json?.valor_saldo ?? item.valor_snapshot)) < 0.005;
}
export function selecionarPagina(atual, itens, adicionar) {
  const next = { ...atual };
  for (const item of itens.filter(podeSelecionarAutorizacao)) {
    const key = String(item.titulo_financeiro_id);
    if (adicionar) next[key] = item;
    else delete next[key];
  }
  return next;
}
export function reconciliarSelecao(atual, itens) {
  const next = { ...atual };
  for (const item of itens) {
    const key = String(item.titulo_financeiro_id);
    if (!next[key]) continue;
    if (Number(next[key].id) !== Number(item.id) || !podeSelecionarAutorizacao(item)) delete next[key];
    else next[key] = item;
  }
  return next;
}
export function agruparDecisoes(itens, decisao, motivo) {
  const lotes = new Map(), titulos = new Set();
  for (const item of itens) {
    if (!podeSelecionarAutorizacao(item) || titulos.has(Number(item.titulo_financeiro_id))) throw Error('A seleção mudou. Atualize e confira os títulos antes de decidir.');
    titulos.add(Number(item.titulo_financeiro_id));
    const id = Number(item.lote_id), grupo = lotes.get(id) || [];
    grupo.push({ item_id: Number(item.id), decisao, motivo: decisao === 'REJEITAR' ? motivo.trim() : null });
    if (grupo.length > 200) throw Error('O lote excede o limite de 200 itens por confirmação.');
    lotes.set(id, grupo);
  }
  return [...lotes].sort(([a], [b]) => a - b);
}
