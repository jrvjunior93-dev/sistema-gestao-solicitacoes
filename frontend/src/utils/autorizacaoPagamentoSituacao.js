export const SITUACOES_AUTORIZACAO = [
  ['RETIRADO', 'Envios retirados'],
  ['AGUARDANDO', 'Aguardando aprovação'], ['QUITADO', 'Quitados'],
  ['PARCIALMENTE_PAGO', 'Parcialmente pago'], ['NAO_PAGO', 'Não pago'], ['NA_FILA', 'Na fila'], ['DIVERGENTE', 'Divergentes'],
  ['REJEITADO', 'Rejeitados'], ['INVALIDADO', 'Invalidados'], ['CANCELADO', 'Cancelados'],
  ['ESTORNADO', 'Estornados'], ['RENEGOCIADO', 'Renegociados'], ['PREVISAO', 'Previsões'],
  ['AUTORIZADO', 'Autorizados — aguardando envio'],
  ['PENDENTE_FINANCEIRO', 'Pendente no financeiro'], ['INDISPONIVEL', 'Indisponíveis'], ['EXCLUIDO', 'Títulos excluídos — histórico']
];
export const rotuloSituacao = value => ({ AGUARDANDO: 'Aguardando aprovação', QUITADO: 'Quitado',
  RETIRADO: 'Envio retirado',
  PARCIALMENTE_PAGO: 'Parcialmente pago', NAO_PAGO: 'Não pago', NA_FILA: 'Na fila', DIVERGENTE: 'Divergente', CONCLUIDO: 'Na fila',
  PENDENTE: 'Aguardando aprovação', ENFILEIRADO: 'Na fila', AUTORIZADO: 'Autorizado — aguardando envio',
  FILA_DIRETA: 'Envio direto à fila',
  PREVISAO: 'Previsão', INDISPONIVEL: 'Indisponível', EXCLUIDO: 'Título excluído', MISTO: 'Situações diferentes',
  PENDENTE_FINANCEIRO: 'Pendente no financeiro'
}[value] || String(value || '').replaceAll('_', ' '));
export const tituloExcluido = item => Boolean(item.exclusao_titulo || item.situacao_financeira === 'EXCLUIDO'
  || item.titulo?.deleted_at || item.titulo?.status === 'EXCLUIDO');
export function podeReenviarAutorizacao(item) {
  return !tituloExcluido(item) && item.origem_painel !== 'FILA_DIRETA' && item.status === 'AUTORIZADO'
    && Number(item.lote_id) > 0 && !item.bloqueado_proprietario && item.titulo
    && ['ABERTO', 'PARCIAL'].includes(item.titulo.status) && Number(item.titulo.valor_saldo) > 0
    && !item.titulo.renegociado_por_id && !['PENDENTE', 'EM_EDICAO', 'NAO_PAGO', 'DIVERGENTE'].includes(item.fila_atual?.status);
}
export function podeAutorizar(item) {
  if (tituloExcluido(item)) return false;
  if (item.origem_painel === 'FILA_DIRETA' || ['PENDENTE','EM_EDICAO','DIVERGENTE','NAO_PAGO'].includes(item.fila_atual?.status)) return false;
  return item.status === 'PENDENTE'
    && item.lote?.status === 'AGUARDANDO' && item.titulo && ['ABERTO', 'PARCIAL'].includes(item.titulo.status)
    && !item.titulo.renegociado_por_id && Number(item.titulo.valor_saldo) > 0
    && Math.abs(Number(item.titulo.valor_saldo) - Number(item.snapshot_json?.valor_saldo ?? item.valor_snapshot)) < 0.005;
}
export function podeRejeitarFila(item) {
  if (tituloExcluido(item)) return false;
  const origemValida = item.origem_painel === 'FILA_DIRETA'
    ? item.status === 'FILA_DIRETA' && item.fila_id > 0 && Boolean(item.versao_painel) && ['PENDENTE','NAO_PAGO','DIVERGENTE'].includes(item.fila_atual?.status)
    : ['AUTORIZADO', 'ENFILEIRADO'].includes(item.status);
  return origemValida && !item.bloqueado_proprietario && item.titulo
    && ['ABERTO', 'PARCIAL'].includes(item.titulo.status) && !item.titulo.renegociado_por_id
    && Number(item.titulo.valor_saldo) > 0 && item.fila_atual?.status !== 'EM_EDICAO';
}
export const podeSelecionarAutorizacao = item => podeAutorizar(item) || podeRejeitarFila(item);
export const podeDecidirItem = (item, decisao) => decisao === 'AUTORIZAR' ? podeAutorizar(item) : podeSelecionarAutorizacao(item);
export const valorSelecionado = item => podeRejeitarFila(item) ? Number(item.titulo.valor_saldo) : Number(item.valor_snapshot);
export const assinaturaDecisao = item => `${item.id}:${item.snapshot_hash}:${item.versao_painel || ''}:${item.valor_snapshot}:${item.status}:${item.titulo?.status}:${item.titulo?.valor_saldo}:${item.titulo?.valor_baixado}`;
export function selecionarPagina(atual, itens, adicionar, podeSelecionar = podeSelecionarAutorizacao) {
  const next = { ...atual };
  for (const item of itens.filter(podeSelecionar)) {
    const key = String(item.titulo_financeiro_id);
    if (adicionar) next[key] = item;
    else delete next[key];
  }
  return next;
}
export function reconciliarSelecao(atual, itens, podeSelecionar = podeSelecionarAutorizacao) {
  const next = { ...atual };
  for (const item of itens) {
    const key = String(item.titulo_financeiro_id);
    if (!next[key]) continue;
    if (Number(next[key].id) !== Number(item.id) || !podeSelecionar(item)) delete next[key];
    else next[key] = item;
  }
  return next;
}
export function agruparDecisoes(itens, decisao, motivo) {
  const lotes = new Map(), titulos = new Set();
  let diretos = 0;
  for (const item of itens) {
    if (!podeDecidirItem(item, decisao) || titulos.has(Number(item.titulo_financeiro_id))) throw Error('A seleção contém títulos indisponíveis para esta decisão. Confira antes de decidir.');
    titulos.add(Number(item.titulo_financeiro_id));
    if (item.origem_painel === 'FILA_DIRETA') {
      if (decisao !== 'REJEITAR') throw Error('Envio direto permite somente rejeitar saldo.');
      const key = `DIRETA:${Math.floor(diretos++ / 50)}`, grupo = lotes.get(key) || [];
      grupo.push({ fila_id: Number(item.fila_id), titulo_id: Number(item.titulo_financeiro_id), versao: item.versao_painel, motivo: motivo.trim() });
      lotes.set(key, grupo); continue;
    }
    const acao = decisao === 'REJEITAR' && podeRejeitarFila(item) ? 'REJEITAR_FILA' : decisao;
    const id = `${Number(item.lote_id)}:${acao === 'REJEITAR_FILA' ? 'FILA' : 'PENDENTE'}`, grupo = lotes.get(id) || [];
    grupo.push({ item_id: Number(item.id), decisao: acao, motivo: decisao === 'REJEITAR' ? motivo.trim() : null });
    if (grupo.length > 200) throw Error('O lote excede o limite de 200 itens por confirmação.');
    lotes.set(id, grupo);
  }
  return [...lotes].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([chave, grupo]) => [chave.startsWith('DIRETA:') ? 'FILA_DIRETA' : Number(chave.split(':')[0]), grupo]);
}
