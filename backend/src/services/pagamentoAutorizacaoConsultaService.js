'use strict';
const { QueryTypes, Op } = require('sequelize');
const { SITUACAO_SQL, exclusaoDoTitulo } = require('./pagamentoAutorizacaoSituacao');
const { obterRemetentes } = require('./pagamentoFilaRemetenteService');
const STATUS = ['AGUARDANDO', 'QUITADO', 'PARCIALMENTE_PAGO', 'NAO_PAGO', 'NA_FILA', 'DIVERGENTE', 'REJEITADO',
  'INVALIDADO', 'CANCELADO', 'ESTORNADO', 'RENEGOCIADO', 'PREVISAO', 'AUTORIZADO', 'PENDENTE_FINANCEIRO', 'INDISPONIVEL', 'EXCLUIDO', 'RETIRADO'];
const erro = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
function filtros(query = {}) {
  const scalar = key => { if (query[key] != null && typeof query[key] !== 'string') erro('Filtro invalido: ' + key); return String(query[key] || '').trim(); };
  const status = scalar('situacao').toUpperCase(); if (status && !STATUS.includes(status)) erro('Situacao financeira invalida.');
  const dataTipo = scalar('data_tipo') || 'VENCIMENTO';
  if (!['VENCIMENTO', 'EMISSAO', 'PAGAMENTO'].includes(dataTipo)) erro('Tipo de data invalido.');
  const inicio = scalar('data_inicio') || scalar('vencimento_inicio'), fim = scalar('data_fim') || scalar('vencimento_fim');
  for (const d of [inicio, fim].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T00:00:00Z')) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) erro('Informe uma data valida.');
  if (inicio && fim && inicio > fim) erro('A data inicial deve ser anterior ou igual a final.');
  const q = scalar('obra'); if (q.length > 120) erro('Busca de obra muito longa.');
  const obra = scalar('obra_id'); if (obra && !/^(0|[1-9]\d{0,9})$/.test(obra)) erro('Obra invalida.');
  const pagina = scalar('pagina') || '1', limite = scalar('limite') || '30';
  if (!/^[1-9]\d{0,5}$/.test(pagina) || !/^[1-9]\d?$/.test(limite) || Number(limite) > 50) erro('Paginacao invalida. Use no maximo 50 registros por pagina.');
  const ids = scalar('item_ids');
  // Negativo e APENAS identidade de leitura da fila direta, nunca item_id de
  // autorizacao. As rotas de decisao digital continuam exigindo IDs positivos.
  if (ids && (!/^-?[1-9]\d*(,-?[1-9]\d*)*$/.test(ids) || ids.split(',').length > 200 || ids.split(',').some(v => !Number.isSafeInteger(Number(v))))) erro('Consulte no maximo 200 itens distintos.');
  const sentido = scalar('sentido'), cursorId = scalar('cursor_item_id'), cursorData = scalar('cursor_vencimento');
  if (sentido || cursorId || cursorData) {
    if (!['ANTERIOR', 'PROXIMA'].includes(sentido) || !/^-?[1-9]\d*$/.test(cursorId) || !Number.isSafeInteger(Number(cursorId))
      || (cursorData !== 'SEM_DATA' && (!/^\d{4}-\d{2}-\d{2}$/.test(cursorData) || !Number.isFinite(Date.parse(cursorData + 'T00:00:00Z')) || new Date(cursorData + 'T00:00:00Z').toISOString().slice(0, 10) !== cursorData))
      || pagina !== '1' || ids) erro('Cursor de navegacao invalido.');
  }
  return { status, dataTipo, inicio, fim, q, obra, pagina: Number(pagina), limite: Number(limite), ids: ids ? [...new Set(ids.split(',').map(Number))] : [],
    sentido, cursorId: Number(cursorId), cursorData };
}
function navegar(f, replacements) {
  if (!f.sentido) return { where: '', ordem: 'f.data_referencia, f.id DESC' };
  const proxima = f.sentido === 'PROXIMA';
  replacements.cursor_id = f.cursorId;
  const id = `f.id ${proxima ? '<' : '>'} :cursor_id`;
  let condicao;
  if (f.cursorData === 'SEM_DATA') condicao = proxima ? `(f.data_referencia IS NOT NULL OR (f.data_referencia IS NULL AND ${id}))` : `(f.data_referencia IS NULL AND ${id})`;
  else {
    replacements.cursor_data = f.cursorData;
    condicao = `(${proxima ? '' : 'f.data_referencia IS NULL OR '}f.data_referencia ${proxima ? '>' : '<'} :cursor_data OR (f.data_referencia = :cursor_data AND ${id}))`;
  }
  return { where: 'WHERE ' + condicao, ordem: proxima ? 'f.data_referencia, f.id DESC' : 'f.data_referencia DESC, f.id ASC' };
}
function consulta(query) {
  const f = filtros(query), replacements = { limite: f.limite, offset: (f.pagina - 1) * f.limite };
  const where = [], partesWhere = [];
  // Um titulo ja parcialmente pago pode ter um NOVO dossie para seu saldo.
  // Aguardando e estado da decisao, nao pode esconder essa pendencia financeira.
  if (f.status === 'AGUARDANDO') where.push("status_decisao = 'PENDENTE' AND lote_status = 'AGUARDANDO' AND (fila_status IS NULL OR fila_status NOT IN ('PENDENTE','EM_EDICAO','DIVERGENTE','NAO_PAGO')) AND titulo_status IN ('ABERTO','PARCIAL') AND valor_saldo > 0 AND renegociado_por_id IS NULL");
  else if (['NA_FILA','DIVERGENTE','NAO_PAGO'].includes(f.status)) where.push(`fila_status ${f.status === 'NA_FILA' ? "IN ('PENDENTE','EM_EDICAO')" : f.status === 'DIVERGENTE' ? "= 'DIVERGENTE'" : "= 'NAO_PAGO'"} AND titulo_status IN ('ABERTO','PARCIAL') AND valor_saldo > 0 AND renegociado_por_id IS NULL AND bloqueado_proprietario = 0`);
  else if (f.status === 'REJEITADO') where.push("(situacao_financeira = 'REJEITADO' OR bloqueado_proprietario = 1)");
  else if (f.status) { where.push('situacao_financeira = :situacao'); replacements.situacao = f.status; }
  if (f.dataTipo === 'PAGAMENTO') {
    if (f.inicio || f.fim) where.push('quantidade_baixas_periodo > 0');
  } else {
    if (f.inicio) where.push('data_referencia >= :inicio');
    if (f.fim) where.push('data_referencia <= :fim');
  }
  if (f.inicio) replacements.inicio = f.inicio;
  if (f.fim) replacements.fim = f.fim;
  if (f.ids.length) { where.push('id IN (:ids)'); replacements.ids = f.ids; }
  if (f.q) { partesWhere.push("obra_nome LIKE :obra ESCAPE '!'"); replacements.obra = '%' + f.q.replace(/[!%_]/g, c => '!' + c) + '%'; }
  if (f.obra) { partesWhere.push('COALESCE(obra_id, 0) = :obra_id'); replacements.obra_id = Number(f.obra); }
  // Universo unico por titulo: ultima autorizacao OU fila direta, sem criar
  // dossies/decisoes artificiais. Movimento ATIVO/BAIXA e a fonte do pago.
  // Agregar IDs uma vez e buscar cada registro pela PK evita subconsultas
  // correlacionadas por titulo/ciclo ao reaproveitar a CTE nos rateios.
  const cte = `WITH fontes AS (
    SELECT titulo_financeiro_id, MAX(id) autorizacao_id, NULL fila_id FROM pagamento_autorizacao_itens GROUP BY titulo_financeiro_id
    UNION ALL
    SELECT titulo_financeiro_id, NULL autorizacao_id, MAX(id) fila_id FROM pagamentos_manuais_fila GROUP BY titulo_financeiro_id
  ), universo AS (SELECT titulo_financeiro_id, MAX(autorizacao_id) autorizacao_id, MAX(fila_id) fila_id
    FROM fontes GROUP BY titulo_financeiro_id),
  pagos AS (SELECT m.titulo_financeiro_id, SUM(m.valor_quitacao) pago_no_periodo,
    COUNT(*) quantidade_baixas_periodo, MAX(m.data_movimento) ultima_baixa_periodo
    FROM movimentos_financeiros m WHERE ${f.dataTipo === 'PAGAMENTO' ? "m.status='ATIVO' AND m.tipo_movimento='BAIXA'" : '1=0'}
    ${f.dataTipo === 'PAGAMENTO' && f.inicio ? 'AND m.data_movimento >= :inicio' : ''}
    ${f.dataTipo === 'PAGAMENTO' && f.fim ? 'AND m.data_movimento <= :fim' : ''}
    GROUP BY m.titulo_financeiro_id),
  atuais AS (
    SELECT COALESCE(a.id,-CAST(f.id AS SIGNED)) id, a.lote_id, u.titulo_financeiro_id,
      CASE WHEN a.id IS NULL THEN 'FILA_DIRETA' ELSE 'AUTORIZACAO' END origem_painel,
      a.status status_decisao, COALESCE(a.valor_snapshot,f.valor_previsto) valor_snapshot,
      l.status lote_status, l.expira_em, t.id titulo_id, t.status titulo_status,
      t.renegociado_por_id, t.renegociacao_id, t.compartilhamento_id, COALESCE(t.obra_id,h.obra_id) obra_id,
      h.deleted_at titulo_excluido_em, h.deleted_by titulo_excluido_por_id,
      h.deleted_reason titulo_excluido_motivo, h.codigo titulo_excluido_codigo, h.descricao titulo_excluido_descricao,
      COALESCE(t.valor_baixado, 0) valor_baixado, COALESCE(t.valor_saldo, 0) valor_saldo,
      COALESCE(t.data_vencimento, a.vencimento_snapshot,h.data_vencimento) vencimento_atual,
      COALESCE(t.data_emissao,h.data_emissao) data_emissao, p.ultima_baixa_periodo, COALESCE(p.pago_no_periodo,0) pago_no_periodo,
      COALESCE(p.quantidade_baixas_periodo,0) quantidade_baixas_periodo,
      CASE WHEN t.bloqueio_pagamento_proprietario IS NULL THEN 0 ELSE 1 END bloqueado_proprietario,
      ${f.dataTipo === 'EMISSAO' ? 'COALESCE(t.data_emissao,h.data_emissao)' : f.dataTipo === 'PAGAMENTO' ? 'p.ultima_baixa_periodo' : 'COALESCE(t.data_vencimento,a.vencimento_snapshot,h.data_vencimento)'} data_referencia,
      ${f.dataTipo === 'PAGAMENTO' ? 'COALESCE(p.pago_no_periodo,0)' : 'COALESCE(a.valor_snapshot,f.valor_previsto)'} valor_consulta,
      f.id fila_id, f.status fila_status, f.motivo fila_motivo,
      (JSON_EXTRACT(f.instrumento_pagamento_json,'$.retirada_envio') IS NOT NULL) fila_retirada,
      f.selecionado_por enviado_por_id, f.selecionado_em enviado_em
    FROM universo u
    LEFT JOIN pagamento_autorizacao_itens a ON a.id=u.autorizacao_id
    LEFT JOIN pagamento_autorizacao_lotes l ON l.id = a.lote_id
    LEFT JOIN titulos_financeiros t ON t.id = u.titulo_financeiro_id AND t.deleted_at IS NULL
    LEFT JOIN titulos_financeiros h ON h.id = u.titulo_financeiro_id AND h.deleted_at IS NOT NULL
    LEFT JOIN pagamentos_manuais_fila f ON f.id=u.fila_id
    LEFT JOIN pagos p ON p.titulo_financeiro_id=u.titulo_financeiro_id
    WHERE a.id IS NOT NULL OR (t.id IS NOT NULL AND t.tipo='PAGAR') OR (h.id IS NOT NULL AND h.tipo='PAGAR')
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
  bases AS (SELECT p.*, f.valor_consulta, ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY p.obra_id) ordem,
    COUNT(*) OVER (PARTITION BY p.id) quantidade,
    FLOOR(ROUND(f.valor_consulta * 100) * p.peso / SUM(p.peso) OVER (PARTITION BY p.id)) centavos
    FROM pesos_positivos p JOIN filtrados f ON f.id = p.id),
  partes AS (SELECT b.id, b.obra_id, COALESCE(o.nome, 'Sem obra definida') obra_nome,
    (b.centavos + CASE WHEN b.ordem = b.quantidade THEN ROUND(b.valor_consulta * 100)
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
  const rows = await db.sequelize.query(cte + ` SELECT f.*, r.valor_no_recorte, r.participacoes_no_recorte,
    COUNT(*) OVER() total FROM filtrados f JOIN (
      SELECT id, SUM(valor_parte) valor_no_recorte,
        JSON_ARRAYAGG(JSON_OBJECT('obra_id', obra_id, 'obra_nome', obra_nome, 'valor', valor_parte)) participacoes_no_recorte
      FROM recorte GROUP BY id) r ON r.id = f.id
    ${cursor.where}
    ORDER BY ${cursor.ordem} LIMIT :limite OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
  const total = rows.length ? Number(rows[0].total) : f.sentido ? 0 : Number((await db.sequelize.query(cte + ' SELECT COUNT(DISTINCT id) total FROM recorte', { replacements, type: QueryTypes.SELECT }))[0]?.total || 0);
  const digitais = rows.filter(r => Number(r.id) > 0), diretos = rows.filter(r => Number(r.id) < 0);
  const items = digitais.length ? await db.PagamentoAutorizacaoItem.findAll({ where: { id: { [Op.in]: digitais.map(r => r.id) } },
    include: [
      { model: db.PagamentoAutorizacaoLote, as: 'lote', attributes: ['id', 'codigo', 'status', 'expira_em', 'criado_por', 'createdAt'] },
      { model: db.PagamentoAutorizacaoDocumento, as: 'documentos', attributes: ['id', 'nome', 'origem_tipo', 'arquivo_hash'] },
      { model: db.TituloFinanceiro, as: 'titulo', required: false, attributes: ['id', 'status', 'valor_baixado', 'valor_saldo', 'renegociado_por_id'],
        include: [{ model: db.Solicitacao, as: 'solicitacao', required: false, attributes: ['id', 'justificativa'] }] }
    ] }) : [];
  const mapa = new Map(items.map(i => [Number(i.id), i.toJSON ? i.toJSON() : i]));
  if (diretos.length) {
    const [titles, filas] = await Promise.all([
      db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: diretos.map(r => r.titulo_financeiro_id) } },
        attributes: ['id','codigo','descricao','status','valor_baixado','valor_saldo','renegociado_por_id','data_emissao','data_vencimento','updatedAt','bloqueio_pagamento_proprietario'],
        include: [
          { model: db.Parceiro, as: 'parceiro', attributes: ['nome'], required: false },
          { model: db.Parceiro, as: 'favorecidoPagamento', attributes: ['nome'], required: false },
          { model: db.Obra, as: 'obra', attributes: ['id','nome'], required: false },
          { model: db.EmpresaGrupo, as: 'empresa', attributes: ['id','nome'], required: false },
          { model: db.Solicitacao, as: 'solicitacao', attributes: ['codigo','descricao','justificativa'], required: false },
          { model: db.FormaPagamentoFinanceira, as: 'formaPagamento', attributes: ['nome'], required: false }
        ] }),
      db.PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: diretos.map(r => r.fila_id) } } })
    ]);
    const { versaoFilaDireta, dadosDoTitulo } = require('./pagamentoFilaDiretaDomain');
    for (const r of diretos) {
      const title = titles.find(t => Number(t.id) === Number(r.titulo_financeiro_id)), fila = filas.find(f => Number(f.id) === Number(r.fila_id));
      if (exclusaoDoTitulo(r) && fila) {
        mapa.set(Number(r.id), { id: Number(r.id), item_id: null, origem_painel: 'FILA_DIRETA', fila_id: Number(fila.id),
          titulo_financeiro_id: Number(r.titulo_financeiro_id), lote_id: null, lote: null, status: 'EXCLUIDO',
          valor_snapshot: Number(fila.valor_previsto), snapshot_hash: null, versao_painel: null, documentos: [], titulo: null,
          snapshot_json: { titulo_id: Number(r.titulo_financeiro_id), codigo: r.titulo_excluido_codigo || title?.codigo,
            descricao: r.titulo_excluido_descricao || title?.descricao, data_vencimento: r.vencimento_atual } });
        continue;
      }
      if (!title || !fila) continue;
      mapa.set(Number(r.id), { id: Number(r.id), item_id: null, origem_painel: 'FILA_DIRETA', fila_id: Number(fila.id),
        titulo_financeiro_id: Number(title.id), lote_id: null, lote: null, status: r.fila_retirada ? 'RETIRADO' : title.bloqueio_pagamento_proprietario ? 'REJEITADO' : 'FILA_DIRETA',
        valor_snapshot: Number(fila.valor_previsto), snapshot_hash: null, snapshot_json: dadosDoTitulo(title),
        versao_painel: versaoFilaDireta(title, fila), documentos: [],
        motivo_decisao: title.bloqueio_pagamento_proprietario?.motivo || null,
        titulo: { id: Number(title.id), status: title.status, valor_baixado: Number(title.valor_baixado), valor_saldo: Number(title.valor_saldo),
          renegociado_por_id: title.renegociado_por_id, solicitacao: title.solicitacao ? { justificativa: title.solicitacao.justificativa } : null } });
    }
  }
  const remetentes = await obterRemetentes(rows, db);
  const envio = r => {
    const item = mapa.get(Number(r.id));
    // Novo pedido de aprovacao ainda nao enfileirado tem remetente proprio.
    // Uma fila antiga/resolvida do titulo nao pertence a esse novo envio.
    if (Number(r.id) > 0 && ['PENDENTE', 'AUTORIZADO'].includes(item?.status) && !item.fila_item_id) {
      return { enviado_por_id: item.lote?.criado_por || null, enviado_em: item.lote?.createdAt || null,
        destino: 'AUTORIZACAO' };
    }
    return { destino: 'FILA', ...(remetentes.get(Number(r.fila_id)) || {
      enviado_por_id: r.enviado_por_id, enviado_em: r.enviado_em
    }) };
  };
  const idsAutores = [...new Set(rows.flatMap(r => [Number(envio(r).enviado_por_id),Number(r.titulo_excluido_por_id)]).filter(Boolean))];
  const autores = idsAutores.length ? await db.User.findAll({ where: { id: { [Op.in]: idsAutores } }, attributes: ['id','nome'] }) : [];
  return { data: rows.flatMap(r => {
    const item = mapa.get(Number(r.id)); if (!item) return [];
    const remetente = envio(r);
    const exclusao = exclusaoDoTitulo(r, autores);
    const fila_atual = r.fila_id ? { id: Number(r.fila_id), status: r.fila_status, motivo: r.fila_motivo, envio_retirado: Boolean(r.fila_retirada) } : null;
    const partes = Array.isArray(r.participacoes_no_recorte) ? r.participacoes_no_recorte : JSON.parse(r.participacoes_no_recorte || '[]');
    return [{ ...item, origem_painel: item.origem_painel || 'AUTORIZACAO', fila_atual,
      ...(exclusao ? { exclusao_titulo: exclusao, titulo: null } : {}),
      enviado_por: remetente.enviado_por_id ? { id: Number(remetente.enviado_por_id), nome: autores.find(a => Number(a.id) === Number(remetente.enviado_por_id))?.nome || 'Usuário não disponível' } : null,
      enviado_em: remetente.enviado_em, envio_destino: remetente.destino,
      bloqueado_proprietario: Boolean(Number(r.bloqueado_proprietario)),
      data_referencia: r.data_referencia, data_emissao: r.data_emissao, ultima_baixa_periodo: r.ultima_baixa_periodo,
      pago_no_periodo: Number(r.pago_no_periodo), situacao_financeira: r.situacao_financeira,
      participacoes_no_recorte: partes, valor_no_recorte: Number(r.valor_no_recorte),
      obras_nomes: partes.map(p => p.obra_nome).sort().join(' / '), vencimento_atual: r.vencimento_atual }];
  }), paginacao: { pagina: f.pagina, limite: f.limite, total, mais: f.pagina * f.limite < total } };
}
module.exports = { filtros, consulta, listarObras, listarTitulos, STATUS };
