'use strict';

// Projecao de leitura. Nunca grava status no dossie nem altera o material assinado.
const FILA_ATIVA = ['PENDENTE', 'EM_EDICAO', 'DIVERGENTE'];
function situacaoItem(item) {
  const t = item.titulo, fila = Object.hasOwn(item, 'fila_atual') ? item.fila_atual : item.filaItem;
  if (!t) return 'INDISPONIVEL';
  if (['CANCELADO', 'ESTORNADO', 'PREVISAO', 'RENEGOCIADO'].includes(t.status)) return t.status;
  if (t.renegociado_por_id) return 'RENEGOCIADO';
  if (t.status === 'QUITADO') return 'QUITADO';
  if (t.status === 'PARCIAL' || Number(t.valor_baixado || 0) > 0) return 'PARCIALMENTE_PAGO';
  if (['REJEITADO', 'INVALIDADO', 'CANCELADO', 'REVOGADO'].includes(item.status)) return item.status;
  // expira_em e metadado legado: nao criar prazo/bloqueio novo nesta projecao.
  if (item.status === 'PENDENTE') return 'AGUARDANDO';
  if (fila?.status === 'NAO_PAGO') return 'NAO_PAGO';
  if (FILA_ATIVA.includes(fila?.status)) return 'NA_FILA';
  if (item.status === 'AUTORIZADO') return 'AUTORIZADO';
  return 'PENDENTE_FINANCEIRO';
}
function situacaoLote(itens, fallback) {
  if (!itens.length) return fallback;
  const estados = itens.map(i => i.situacao_financeira);
  if (estados.every(s => s === 'QUITADO')) return 'QUITADO';
  if (estados.some(s => ['QUITADO', 'PARCIALMENTE_PAGO'].includes(s))) return 'PARCIALMENTE_PAGO';
  if (estados.some(s => s === 'AGUARDANDO')) return 'AGUARDANDO';
  if (estados.every(s => s === 'NAO_PAGO')) return 'NAO_PAGO';
  if (estados.some(s => s === 'NA_FILA')) return 'NA_FILA';
  return estados.every(s => s === estados[0]) ? estados[0] : 'MISTO';
}
function projetarLote(lote) {
  const copia = lote.toJSON ? lote.toJSON() : structuredClone(lote);
  copia.itens = (copia.itens || []).map(item => ({ ...item,
    situacao_financeira: situacaoItem({ ...item, lote: copia }) }));
  copia.situacao_financeira = situacaoLote(copia.itens, copia.status);
  copia.resumo_situacoes = copia.itens.reduce((acc, i) => {
    acc[i.situacao_financeira] = (acc[i.situacao_financeira] || 0) + 1; return acc;
  }, {});
  return copia;
}
async function projetarLotesAtuais(lotes, sequelize) {
  const copias = lotes.map(l => l.toJSON ? l.toJSON() : structuredClone(l));
  const ids = copias.filter(l => (l.itens || []).some(i => Number(i.titulo_financeiro_id) > 0)).map(l => Number(l.id));
  if (ids.length) {
    // Um SELECT por pagina/detalhe, incluindo ciclos de retorno posteriores ao
    // fila_item_id original. Sem N+1 e sem alterar vinculo ou assinatura.
    const filas = await sequelize.query(`SELECT f.id,f.titulo_financeiro_id,f.status,f.motivo
      FROM pagamentos_manuais_fila f JOIN (
        SELECT MAX(f2.id) id FROM pagamentos_manuais_fila f2
        JOIN pagamento_autorizacao_itens a ON a.titulo_financeiro_id=f2.titulo_financeiro_id
        WHERE a.lote_id IN (:lotes) GROUP BY f2.titulo_financeiro_id
      ) atual ON atual.id=f.id`, { replacements: { lotes: ids }, type: require('sequelize').QueryTypes.SELECT });
    const porTitulo = new Map(filas.map(f => [Number(f.titulo_financeiro_id), f]));
    for (const lote of copias) for (const item of lote.itens || []) item.fila_atual = porTitulo.get(Number(item.titulo_financeiro_id)) || null;
  }
  return copias.map(projetarLote);
}
// Mesma precedencia da funcao pura, sobre colunas explicitas da CTE atuais.
const SITUACAO_SQL = `CASE
  WHEN titulo_id IS NULL THEN 'INDISPONIVEL'
  WHEN titulo_status IN ('CANCELADO','ESTORNADO','PREVISAO','RENEGOCIADO') THEN titulo_status
  WHEN renegociado_por_id IS NOT NULL THEN 'RENEGOCIADO'
  WHEN titulo_status = 'QUITADO' THEN 'QUITADO'
  WHEN titulo_status = 'PARCIAL' OR valor_baixado > 0 THEN 'PARCIALMENTE_PAGO'
  WHEN status_decisao IN ('REJEITADO','INVALIDADO','CANCELADO','REVOGADO') THEN status_decisao
  WHEN status_decisao = 'PENDENTE' THEN 'AGUARDANDO'
  WHEN fila_status = 'NAO_PAGO' THEN 'NAO_PAGO'
  WHEN fila_status IN ('PENDENTE','EM_EDICAO','DIVERGENTE') THEN 'NA_FILA'
  WHEN status_decisao = 'AUTORIZADO' THEN 'AUTORIZADO'
  ELSE 'PENDENTE_FINANCEIRO' END`;
module.exports = { situacaoItem, situacaoLote, projetarLote, projetarLotesAtuais, SITUACAO_SQL };
