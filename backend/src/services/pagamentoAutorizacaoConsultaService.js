'use strict';
const { QueryTypes, Op } = require('sequelize');
const { SITUACAO_SQL, situacaoItem } = require('./pagamentoAutorizacaoSituacao');
const STATUS = ['AGUARDANDO', 'QUITADO', 'PARCIALMENTE_PAGO', 'NAO_PAGO', 'NA_FILA', 'REJEITADO',
  'INVALIDADO', 'CANCELADO', 'ESTORNADO', 'RENEGOCIADO', 'PREVISAO', 'AUTORIZADO', 'PENDENTE_FINANCEIRO', 'INDISPONIVEL'];
const erro = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
function filtros(query = {}) {
  const scalar = key => { if (query[key] != null && typeof query[key] !== 'string') erro('Filtro invalido: ' + key); return String(query[key] || '').trim(); };
  const status = scalar('situacao').toUpperCase(); if (status && !STATUS.includes(status)) erro('Situacao financeira invalida.');
  const inicio = scalar('vencimento_inicio'), fim = scalar('vencimento_fim');
  for (const d of [inicio, fim].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T00:00:00Z')) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) erro('Informe uma data de vencimento valida.');
  if (inicio && fim && inicio > fim) erro('O vencimento inicial deve ser anterior ao final.');
  const q = scalar('obra'); if (q.length > 120) erro('Busca de obra muito longa.');
  const obra = scalar('obra_id'); if (obra && !/^(0|[1-9]\d{0,9})$/.test(obra)) erro('Obra invalida.');
  const pagina = scalar('pagina') || '1', limite = scalar('limite') || '30';
  if (!/^[1-9]\d{0,5}$/.test(pagina) || !/^[1-9]\d?$/.test(limite) || Number(limite) > 50) erro('Paginacao invalida. Use no maximo 50 registros por pagina.');
  const ids = scalar('item_ids');
  if (ids && (!/^[1-9]\d*(,[1-9]\d*)*$/.test(ids) || ids.split(',').length > 200 || ids.split(',').some(v => !Number.isSafeInteger(Number(v))))) erro('Consulte no maximo 200 itens distintos.');
  const sentido = scalar('sentido'), cursorId = scalar('cursor_item_id'), cursorData = scalar('cursor_vencimento');
  if (sentido || cursorId || cursorData) {
    if (!['ANTERIOR', 'PROXIMA'].includes(sentido) || !/^[1-9]\d*$/.test(cursorId) || !Number.isSafeInteger(Number(cursorId))
      || (cursorData !== 'SEM_DATA' && (!/^\d{4}-\d{2}-\d{2}$/.test(cursorData) || !Number.isFinite(Date.parse(cursorData + 'T00:00:00Z')) || new Date(cursorData + 'T00:00:00Z').toISOString().slice(0, 10) !== cursorData))
      || pagina !== '1' || ids) erro('Cursor de navegacao invalido.');
  }
  return { status, inicio, fim, q, obra, pagina: Number(pagina), limite: Number(limite), ids: ids ? [...new Set(ids.split(',').map(Number))] : [],
    sentido, cursorId: Number(cursorId), cursorData };
}
function navegar(f, replacements) {
  if (!f.sentido) return { where: '', ordem: 'f.vencimento_atual, f.id DESC' };
  const proxima = f.sentido === 'PROXIMA';
  replacements.cursor_id = f.cursorId;
  const id = `f.id ${proxima ? '<' : '>'} :cursor_id`;
  let condicao;
  if (f.cursorData === 'SEM_DATA') condicao = proxima ? `(f.vencimento_atual IS NOT NULL OR (f.vencimento_atual IS NULL AND ${id}))` : `(f.vencimento_atual IS NULL AND ${id})`;
  else {
    replacements.cursor_data = f.cursorData;
    condicao = `(${proxima ? '' : 'f.vencimento_atual IS NULL OR '}f.vencimento_atual ${proxima ? '>' : '<'} :cursor_data OR (f.vencimento_atual = :cursor_data AND ${id}))`;
  }
  return { where: 'WHERE ' + condicao, ordem: proxima ? 'f.vencimento_atual, f.id DESC' : 'f.vencimento_atual DESC, f.id ASC' };
}
function consulta(query) {
  const f = filtros(query), replacements = { limite: f.limite, offset: (f.pagina - 1) * f.limite };
  const where = [], partesWhere = [];
  // Um titulo ja parcialmente pago pode ter um NOVO dossie para seu saldo.
  // Aguardando e estado da decisao, nao pode esconder essa pendencia financeira.
  if (f.status === 'AGUARDANDO') where.push("status_decisao = 'PENDENTE' AND lote_status = 'AGUARDANDO' AND titulo_status IN ('ABERTO','PARCIAL') AND valor_saldo > 0 AND renegociado_por_id IS NULL");
  else if (f.status === 'NAO_PAGO') where.push("fila_status = 'NAO_PAGO' AND status_decisao IN ('AUTORIZADO','ENFILEIRADO') AND titulo_status IN ('ABERTO','PARCIAL') AND valor_saldo > 0 AND renegociado_por_id IS NULL");
  else if (f.status === 'NA_FILA') where.push("fila_status IN ('PENDENTE','EM_EDICAO','DIVERGENTE') AND status_decisao IN ('AUTORIZADO','ENFILEIRADO') AND titulo_status IN ('ABERTO','PARCIAL') AND valor_saldo > 0 AND renegociado_por_id IS NULL");
  else if (f.status) { where.push('situacao_financeira = :situacao'); replacements.situacao = f.status; }
  if (f.inicio) { where.push('vencimento_atual >= :inicio'); replacements.inicio = f.inicio; }
  if (f.fim) { where.push('vencimento_atual <= :fim'); replacements.fim = f.fim; }
  if (f.ids.length) { where.push('id IN (:ids)'); replacements.ids = f.ids; }
  if (f.q) { partesWhere.push("obra_nome LIKE :obra ESCAPE '!'"); replacements.obra = '%' + f.q.replace(/[!%_]/g, c => '!' + c) + '%'; }
  if (f.obra) { partesWhere.push('COALESCE(obra_id, 0) = :obra_id'); replacements.obra_id = Number(f.obra); }
  // Dossies atuais somente; historico completo continua na visao por lote. Nenhuma
  // consulta inclui titulos que nao tenham sido enviados para autorizacao.
  const cte = `WITH atuais AS (
    SELECT a.id, a.lote_id, a.titulo_financeiro_id, a.status status_decisao, a.valor_snapshot,
      l.status lote_status, l.expira_em, t.id titulo_id, t.status titulo_status,
      t.renegociado_por_id, t.renegociacao_id, t.compartilhamento_id, t.obra_id,
      COALESCE(t.valor_baixado, 0) valor_baixado, COALESCE(t.valor_saldo, 0) valor_saldo,
      COALESCE(t.data_vencimento, a.vencimento_snapshot) vencimento_atual,
      f.id fila_id, f.status fila_status, f.motivo fila_motivo
    FROM pagamento_autorizacao_itens a
    JOIN pagamento_autorizacao_lotes l ON l.id = a.lote_id
    LEFT JOIN titulos_financeiros t ON t.id = a.titulo_financeiro_id AND t.deleted_at IS NULL
    LEFT JOIN pagamentos_manuais_fila f ON f.id = (
      SELECT MAX(f2.id) FROM pagamentos_manuais_fila f2 WHERE f2.titulo_financeiro_id = a.titulo_financeiro_id)
    WHERE NOT EXISTS (SELECT 1 FROM pagamento_autorizacao_itens n
      WHERE n.titulo_financeiro_id = a.titulo_financeiro_id AND n.id > a.id)
  ), situados AS (SELECT atuais.*, ${SITUACAO_SQL} situacao_financeira FROM atuais),
  filtrados AS (SELECT * FROM situados ${where.length ? 'WHERE ' + where.join(' AND ') : ''}),
  pesos AS (
    SELECT f.id, p.obra_id, SUM(p.valor) peso FROM filtrados f
      JOIN titulos_compartilhados_origens p ON p.titulo_financeiro_id = f.titulo_id
      WHERE f.compartilhamento_id IS NOT NULL GROUP BY f.id, p.obra_id
    UNION ALL SELECT f.id, p.obra_id, SUM(p.valor) FROM filtrados f
      JOIN titulo_renegociacao_alocacoes p ON p.titulo_destino_id = f.titulo_id
      WHERE f.compartilhamento_id IS NULL AND f.renegociacao_id IS NOT NULL GROUP BY f.id, p.obra_id
    UNION ALL SELECT f.id, p.obra_id, SUM(p.valor_rateio) FROM filtrados f
      JOIN titulos_financeiros_rateios p ON p.titulo_financeiro_id = f.titulo_id
      WHERE f.compartilhamento_id IS NULL AND f.renegociacao_id IS NULL GROUP BY f.id, p.obra_id
  ), pesos_positivos AS (SELECT id, obra_id, SUM(peso) peso FROM pesos WHERE peso > 0 GROUP BY id, obra_id
    UNION ALL SELECT f.id, f.obra_id, 1 FROM filtrados f
      WHERE NOT EXISTS (SELECT 1 FROM pesos p WHERE p.id = f.id AND p.peso > 0)),
  bases AS (SELECT p.*, f.valor_snapshot, ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY p.obra_id) ordem,
    COUNT(*) OVER (PARTITION BY p.id) quantidade,
    FLOOR(ROUND(f.valor_snapshot * 100) * p.peso / SUM(p.peso) OVER (PARTITION BY p.id)) centavos
    FROM pesos_positivos p JOIN filtrados f ON f.id = p.id),
  partes AS (SELECT b.id, b.obra_id, COALESCE(o.nome, 'Sem obra definida') obra_nome,
    (b.centavos + CASE WHEN b.ordem = b.quantidade THEN ROUND(b.valor_snapshot * 100)
      - SUM(b.centavos) OVER (PARTITION BY b.id) ELSE 0 END) / 100 valor_parte
    FROM bases b LEFT JOIN \`Obras\` o ON o.id = b.obra_id),
  recorte AS (SELECT * FROM partes ${partesWhere.length ? 'WHERE ' + partesWhere.join(' AND ') : ''})`;
  return { f, cte, replacements };
}
async function listarObras(query = {}, db = require('../models')) {
  const { f, cte, replacements } = consulta(query);
  const executar = sql => db.sequelize.query(cte + sql, { replacements, type: QueryTypes.SELECT });
  const resumo = await executar(' SELECT COUNT(DISTINCT id) quantidade_titulos, COALESCE(SUM(valor_parte),0) valor_total FROM recorte');
  const rows = await executar(` SELECT COALESCE(obra_id,0) obra_id, obra_nome, COUNT(DISTINCT id) quantidade_titulos,
    SUM(valor_parte) valor_total, COUNT(*) OVER() total_obras FROM recorte GROUP BY obra_id, obra_nome
    ORDER BY obra_nome, obra_id LIMIT :limite OFFSET :offset`);
  const total = rows.length ? Number(rows[0].total_obras) : Number((await executar(' SELECT COUNT(*) total FROM (SELECT obra_id FROM recorte GROUP BY obra_id) obras_filtradas'))[0]?.total || 0);
  return { data: rows.map(({ total_obras, ...r }) => ({ ...r, obra_id: Number(r.obra_id), quantidade_titulos: Number(r.quantidade_titulos), valor_total: Number(r.valor_total) })),
    resumo: { quantidade_titulos: Number(resumo[0]?.quantidade_titulos || 0), valor_total: Number(resumo[0]?.valor_total || 0) },
    paginacao: { pagina: f.pagina, limite: f.limite, total, mais: f.pagina * f.limite < total } };
}
async function listarTitulos(query = {}, db = require('../models')) {
  const { f, cte, replacements } = consulta(query);
  const cursor = navegar(f, replacements);
  const rows = await db.sequelize.query(cte + ` SELECT f.*, SUM(r.valor_parte) valor_no_recorte,
    JSON_ARRAYAGG(JSON_OBJECT('obra_id', r.obra_id, 'obra_nome', r.obra_nome, 'valor', r.valor_parte)) participacoes_no_recorte,
    COUNT(*) OVER() total FROM filtrados f JOIN recorte r ON r.id = f.id
    ${cursor.where}
    GROUP BY f.id, f.lote_id, f.titulo_financeiro_id, f.status_decisao, f.valor_snapshot, f.lote_status, f.expira_em,
      f.titulo_id, f.titulo_status, f.renegociado_por_id, f.renegociacao_id, f.compartilhamento_id, f.obra_id,
      f.valor_baixado, f.valor_saldo, f.vencimento_atual, f.fila_id, f.fila_status, f.fila_motivo, f.situacao_financeira
    ORDER BY ${cursor.ordem} LIMIT :limite OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
  const total = rows.length ? Number(rows[0].total) : f.sentido ? 0 : Number((await db.sequelize.query(cte + ' SELECT COUNT(DISTINCT id) total FROM recorte', { replacements, type: QueryTypes.SELECT }))[0]?.total || 0);
  const items = rows.length ? await db.PagamentoAutorizacaoItem.findAll({ where: { id: { [Op.in]: rows.map(r => r.id) } },
    include: [
      { model: db.PagamentoAutorizacaoLote, as: 'lote', attributes: ['id', 'codigo', 'status', 'expira_em'] },
      { model: db.PagamentoAutorizacaoDocumento, as: 'documentos', attributes: ['id', 'nome', 'origem_tipo', 'arquivo_hash'] },
      { model: db.TituloFinanceiro, as: 'titulo', required: false, attributes: ['id', 'status', 'valor_baixado', 'valor_saldo', 'renegociado_por_id'],
        include: [{ model: db.Solicitacao, as: 'solicitacao', required: false, attributes: ['id', 'justificativa'] }] }
    ] }) : [];
  const mapa = new Map(items.map(i => [Number(i.id), i.toJSON ? i.toJSON() : i]));
  return { data: rows.flatMap(r => {
    const item = mapa.get(Number(r.id)); if (!item) return [];
    const fila_atual = r.fila_id ? { id: Number(r.fila_id), status: r.fila_status, motivo: r.fila_motivo } : null;
    const partes = Array.isArray(r.participacoes_no_recorte) ? r.participacoes_no_recorte : JSON.parse(r.participacoes_no_recorte || '[]');
    return [{ ...item, fila_atual, situacao_financeira: situacaoItem({ ...item, fila_atual }),
      participacoes_no_recorte: partes, valor_no_recorte: Number(r.valor_no_recorte),
      obras_nomes: partes.map(p => p.obra_nome).sort().join(' / '), vencimento_atual: r.vencimento_atual }];
  }), paginacao: { pagina: f.pagina, limite: f.limite, total, mais: f.pagina * f.limite < total } };
}
module.exports = { filtros, consulta, listarObras, listarTitulos, STATUS };
