'use strict';

// Projecao de leitura. Nunca grava status no dossie nem altera o material assinado.
const FILA_ATIVA = ['PENDENTE', 'EM_EDICAO'];
function exclusaoDoTitulo(row, autores = []) {
  if (!row?.titulo_excluido_em && row?.titulo_status !== 'EXCLUIDO') return null;
  const id = Number(row.titulo_excluido_por_id) || null;
  return { em: row.titulo_excluido_em || null,
    responsavel: id ? { id, nome: row.titulo_excluido_por_nome || autores.find(a => Number(a.id) === id)?.nome || 'Responsável não disponível' } : null,
    motivo: row.titulo_excluido_motivo || null };
}
function situacaoItem(item) {
  const t = item.titulo, fila = Object.hasOwn(item, 'fila_atual') ? item.fila_atual : item.filaItem;
  if (item.exclusao_titulo || t?.deleted_at || t?.status === 'EXCLUIDO') return 'EXCLUIDO';
  if (!t) return 'INDISPONIVEL';
  if (['CANCELADO', 'ESTORNADO', 'PREVISAO', 'RENEGOCIADO'].includes(t.status)) return t.status;
  if (t.renegociado_por_id) return 'RENEGOCIADO';
  if (t.status === 'QUITADO') return 'QUITADO';
  if ((item.status === 'RETIRADO' && !['PENDENTE', 'EM_EDICAO', 'NAO_PAGO', 'DIVERGENTE'].includes(fila?.status))
    || (fila?.envio_retirado && !['PENDENTE', 'AUTORIZADO'].includes(item.status))) return 'RETIRADO';
  if (t.status === 'PARCIAL' || Number(t.valor_baixado || 0) > 0) return 'PARCIALMENTE_PAGO';
  if (t.bloqueio_pagamento_proprietario || item.bloqueado_proprietario) return 'REJEITADO';
  // expira_em e metadado legado: nao criar prazo/bloqueio novo nesta projecao.
  if (fila?.status === 'NAO_PAGO') return 'NAO_PAGO';
  if (fila?.status === 'DIVERGENTE') return 'DIVERGENTE';
  if (FILA_ATIVA.includes(fila?.status)) return 'NA_FILA';
  if (['REJEITADO', 'INVALIDADO', 'CANCELADO', 'REVOGADO'].includes(item.status)) return item.status;
  if (item.status === 'PENDENTE') return 'AGUARDANDO';
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
  copia.itens = (copia.itens || []).map(item => {
    const exclusao = item.exclusao_titulo || exclusaoDoTitulo({ titulo_status:item.titulo?.status,
      titulo_excluido_em:item.titulo?.deleted_at, titulo_excluido_por_id:item.titulo?.deleted_by,
      titulo_excluido_motivo:item.titulo?.deleted_reason });
    return { ...item, ...(exclusao ? {exclusao_titulo:exclusao,titulo:null} : {}),
      situacao_financeira: situacaoItem({ ...item, exclusao_titulo:exclusao, lote: copia }) };
  });
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
    const filas = await sequelize.query(`SELECT f.id,f.titulo_financeiro_id,f.status,f.motivo,
      (JSON_EXTRACT(f.instrumento_pagamento_json,'$.retirada_envio') IS NOT NULL) envio_retirado
      FROM pagamentos_manuais_fila f JOIN (
        SELECT MAX(f2.id) id FROM pagamentos_manuais_fila f2
        JOIN pagamento_autorizacao_itens a ON a.titulo_financeiro_id=f2.titulo_financeiro_id
        WHERE a.lote_id IN (:lotes) GROUP BY f2.titulo_financeiro_id
      ) atual ON atual.id=f.id`, { replacements: { lotes: ids }, type: require('sequelize').QueryTypes.SELECT });
    const porTitulo = new Map(filas.map(f => [Number(f.titulo_financeiro_id), f]));
    for (const lote of copias) for (const item of lote.itens || []) item.fila_atual = porTitulo.get(Number(item.titulo_financeiro_id)) || null;
    // Historico autorizado, somente metadados de exclusao por PK. Nunca abrir
    // o scope operacional do titulo nem devolver um titulo excluido como ativo.
    const ausentes = [...new Set(copias.flatMap(l => l.itens || []).filter(i => !i.titulo)
      .map(i => Number(i.titulo_financeiro_id)).filter(id => id > 0))];
    if (ausentes.length) {
      const excluidos = await sequelize.query(`SELECT t.id, t.deleted_at titulo_excluido_em,
        t.deleted_by titulo_excluido_por_id, u.nome titulo_excluido_por_nome,
        t.deleted_reason titulo_excluido_motivo FROM titulos_financeiros t
        LEFT JOIN users u ON u.id=t.deleted_by
        WHERE t.id IN (:titulos_excluidos) AND t.deleted_at IS NOT NULL`,
      { replacements: { titulos_excluidos: ausentes }, type: require('sequelize').QueryTypes.SELECT });
      const porId = new Map(excluidos.map(t => [Number(t.id), exclusaoDoTitulo(t)]));
      for (const lote of copias) for (const item of lote.itens || []) {
        const exclusao = porId.get(Number(item.titulo_financeiro_id));
        if (exclusao) { item.exclusao_titulo = exclusao; item.titulo = null; }
      }
    }
  }
  return copias.map(projetarLote);
}
// Mesma precedencia da funcao pura, sobre colunas explicitas da CTE atuais.
const SITUACAO_SQL = `CASE
  WHEN titulo_excluido_em IS NOT NULL OR titulo_status = 'EXCLUIDO' THEN 'EXCLUIDO'
  WHEN titulo_id IS NULL THEN 'INDISPONIVEL'
  WHEN titulo_status IN ('CANCELADO','ESTORNADO','PREVISAO','RENEGOCIADO') THEN titulo_status
  WHEN renegociado_por_id IS NOT NULL THEN 'RENEGOCIADO'
  WHEN titulo_status = 'QUITADO' THEN 'QUITADO'
  WHEN (status_decisao = 'RETIRADO' AND (fila_status IS NULL OR fila_status NOT IN ('PENDENTE','EM_EDICAO','NAO_PAGO','DIVERGENTE')))
    OR (fila_retirada = 1 AND (status_decisao IS NULL OR status_decisao NOT IN ('PENDENTE','AUTORIZADO'))) THEN 'RETIRADO'
  WHEN titulo_status = 'PARCIAL' OR valor_baixado > 0 THEN 'PARCIALMENTE_PAGO'
  WHEN bloqueado_proprietario = 1 THEN 'REJEITADO'
  WHEN fila_status = 'NAO_PAGO' THEN 'NAO_PAGO'
  WHEN fila_status = 'DIVERGENTE' THEN 'DIVERGENTE'
  WHEN fila_status IN ('PENDENTE','EM_EDICAO') THEN 'NA_FILA'
  WHEN status_decisao IN ('REJEITADO','INVALIDADO','CANCELADO','REVOGADO') THEN status_decisao
  WHEN status_decisao = 'PENDENTE' THEN 'AGUARDANDO'
  WHEN status_decisao = 'AUTORIZADO' THEN 'AUTORIZADO'
  ELSE 'PENDENTE_FINANCEIRO' END`;
module.exports = { situacaoItem, situacaoLote, projetarLote, projetarLotesAtuais, exclusaoDoTitulo, SITUACAO_SQL };
