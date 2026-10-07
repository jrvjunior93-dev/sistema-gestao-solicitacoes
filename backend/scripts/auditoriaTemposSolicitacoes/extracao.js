'use strict';

// Conexao direta opcional. Nenhum import do runtime, dotenv, SSH, migration ou model.
const SPECS = {
  solicitacoes: ['id', 'codigo', 'tipo_solicitacao_id', 'obra_id', 'criado_por', 'area_responsavel', 'status_global', 'cancelada', 'createdAt', 'updatedAt'],
  historicos: ['id', 'solicitacao_id', 'usuario_responsavel_id', 'setor', 'acao', 'status_anterior', 'status_novo', 'medicao_id', 'createdAt'],
  status_area: ['id', 'solicitacao_id', 'setor', 'status', 'createdAt'],
  anexos: ['id', 'solicitacao_id', 'medicao_id', 'uploaded_by', 'area_origem', 'deleted_at', 'createdAt'],
  solicitacao_compras: ['id', 'solicitacao_principal_id', 'createdAt'],
  solicitacao_compra_logs: ['id', 'solicitacao_compra_id', 'usuario_id', 'fornecedor_compra_id', 'tipo_acao', 'createdAt'],
  pedido_compras: ['id', 'solicitacao_compra_id', 'criado_por', 'createdAt'],
  titulos_financeiros: ['id', 'solicitacao_id', 'criado_por', 'createdAt'],
  movimentos_financeiros: ['id', 'titulo_financeiro_id', 'criado_por', 'createdAt'],
  pagamentos_manuais_fila: ['id', 'titulo_financeiro_id', 'createdAt'],
  contratos: ['id', 'solicitacao_id', 'createdAt'],
  security_event_logs: ['id', 'usuario_id', 'tipo_evento', 'recurso_tipo', 'recurso_id', 'status', 'createdAt'],
  governanca_eventos_operacionais: ['id', 'ocorrido_em', 'usuario_id', 'setor_id', 'categoria', 'tipo_evento', 'resultado', 'recurso_tipo', 'recurso_id', 'rota_padrao'],
  setores: ['id', 'codigo', 'nome'], users: ['id', 'nome'], tipo_solicitacao: ['id', 'nome']
};
const HISTORY_KEYS = ['ator_id', 'responsavel_id', 'setor_origem', 'setor_destino', 'area_anterior', 'area_nova', 'origem', 'retorno_automatico_baixa', 'automatico', 'automacao'];
const AUDIT_KEYS = ['actor_id', 'dev_user_switch', 'status_destino', 'setor_destino', 'campos_alterados', 'campos_informados'];
function quote(identifier) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) throw new Error('Identificador SQL invalido.');
  return `\`${identifier}\``;
}
function buildSchema(rows) {
  const schema = new Map();
  for (const r of rows) {
    const key = r.TABLE_NAME.toLowerCase();
    if (!schema.has(key)) schema.set(key, { name: r.TABLE_NAME, columns: new Map() });
    schema.get(key).columns.set(r.COLUMN_NAME.toLowerCase(), r.COLUMN_NAME);
  }
  return schema;
}
function projection(schema, table, warnings) {
  const t = schema.get(table);
  const column = (name) => t.columns.has(name.toLowerCase()) ? quote(t.columns.get(name.toLowerCase())) : null;
  const parts = SPECS[table].map((name) => {
    const c = column(name);
    if (!c) warnings.push({ tabela: table, coluna: name, problema: 'COLUNA_OPCIONAL_AUSENTE' });
    return `${c || 'NULL'} AS ${quote(name)}`;
  });
  const meta = (name, keys) => {
    const col = column(name);
    if (!col) { parts.push(`NULL AS ${quote(name)}`); return; }
    const safe = `CASE WHEN JSON_VALID(${col}) THEN ${col} ELSE '{}' END`;
    parts.push(`JSON_OBJECT(${keys.map((key) => `'${key}', JSON_EXTRACT(${safe}, '$.${key}')`).join(', ')}) AS ${quote(name)}`);
  };
  if (table === 'historicos') {
    meta('metadata', HISTORY_KEYS);
    // Nao extrai comentarios. A observacao de envio serve apenas ao parser "De X para Y".
    parts.push(column('observacao') ? `CASE WHEN ${column('acao')} = 'ENVIADA_SETOR' THEN ${column('observacao')} ELSE NULL END AS observacao` : 'NULL AS observacao');
    parts.push(column('descricao') ? `CASE WHEN LOWER(COALESCE(${column('descricao')}, '')) LIKE '%automatic%' THEN 1 ELSE 0 END AS automatica` : '0 AS automatica');
  }
  if (table === 'governanca_eventos_operacionais') meta('metadata_json', AUDIT_KEYS);
  if (table === 'security_event_logs') meta('metadata', ['area_responsavel']);
  return parts.join(', ');
}
async function extract(connection, options) {
  options = { ...options };
  const warnings = [], sqlLog = [], sourceCounts = {};
  let total = 0;
  async function read(sql, params = []) {
    if (!/^SELECT\b/i.test(sql.trim()) || /;/.test(sql)) throw new Error('Extracao aceita apenas SELECT unico.');
    sqlLog.push({ sql, parametros: params });
    const [rows] = await connection.execute({ sql, timeout: options.timeoutMs || 30000 }, params);
    total += rows.length;
    if (total > options.maxRows) throw new Error('Limite de linhas atingido. Nenhum relatorio parcial sera entregue; divida o escopo explicitamente.');
    return rows;
  }
  let clock = null;
  if (options.fullHistory) {
    if (options.requestIds?.length) throw new Error('Historico completo nao aceita filtro de IDs.');
    [clock] = await read('SELECT CURRENT_TIMESTAMP(3) AS corte_servidor, @@session.time_zone AS fuso_sessao, @@system_time_zone AS fuso_sistema');
    if (!clock?.corte_servidor) throw new Error('Relogio do banco indisponivel.');
    options.cutoffSql = clock.corte_servidor;
    options.sinceSql = '1000-01-01 00:00:00';
  }
  const schemaRows = await read('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
  const schema = buildSchema(schemaRows);
  const engines = await read('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  for (const t of engines) if (SPECS[t.TABLE_NAME.toLowerCase()] && t.ENGINE !== 'InnoDB') throw new Error('Fonte nao transacional detectada. Auditoria exige snapshot InnoDB consistente.');
  for (const [table, fields] of Object.entries({ solicitacoes: ['id', 'createdAt', 'area_responsavel', 'tipo_solicitacao_id'], historicos: ['id', 'solicitacao_id', 'createdAt', 'acao', 'setor'] })) {
    if (!schema.has(table) || fields.some((f) => !schema.get(table).columns.has(f.toLowerCase()))) throw new Error(`Schema obrigatorio indisponivel: ${table}.`);
  }
  async function rows(table, { field, ids, sinceId, root = false, dateField = 'createdAt' } = {}) {
    const t = schema.get(table);
    const required = ['id', ...(field ? [field] : []), ...(dateField ? [dateField] : [])];
    if (!t || required.some((f) => !t.columns.has(f.toLowerCase()))) {
      warnings.push({ tabela: table, problema: 'FONTE_OPCIONAL_INDISPONIVEL' }); return [];
    }
    if (ids && !ids.length) return [];
    const col = (f) => quote(t.columns.get(f.toLowerCase()));
    const conditions = [], params = [];
    if (field) { conditions.push(`${col(field)} IN (${ids.map(() => '?').join(', ')})`); params.push(...ids); }
    if (sinceId != null) { conditions.push(`${col('id')} > ?`); params.push(sinceId); }
    if (dateField) { conditions.push(root && options.fullHistory ? `(${col(dateField)} < ? OR ${col(dateField)} IS NULL)` : `${col(dateField)} < ?`); params.push(options.cutoffSql); }
    if (table === 'governanca_eventos_operacionais' && t.columns.has('modulo')) conditions.push("modulo IN ('SOLICITACOES', 'COMPRAS', 'FINANCEIRO', 'CONTRATOS', 'ANEXOS')");
    if (table === 'security_event_logs') {
      if (!t.columns.has('tipo_evento') || !t.columns.has('recurso_tipo') || !t.columns.has('status')) return [];
      conditions.push("tipo_evento = 'SOLICITACAO_CREATED' AND recurso_tipo = 'SOLICITACAO' AND status = 'SUCCESS'");
    }
    if (root && options.requestIds?.length) { conditions.push(`${col('id')} IN (${options.requestIds.map(() => '?').join(', ')})`); params.push(...options.requestIds); }
    const limit = root ? 250 : Math.min(options.maxRows + 1, 500001);
    const sql = `SELECT ${projection(schema, table, warnings)} FROM ${quote(t.name)}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${col('id')} LIMIT ${limit}`;
    const result = await read(sql, params);
    if (!root && result.length === limit) throw new Error(`Limite por consulta atingido em ${table}; nao houve truncamento silencioso.`);
    sourceCounts[table] = (sourceCounts[table] || 0) + result.length;
    return result;
  }
  const data = { solicitacoes: [], historicos: [], status_area: [], anexos: [], compras: [], pedidos: [], compras_logs: [], titulos: [], movimentos: [], fila: [], contratos: [], criacoes_auditadas: [], operacionais: [] };
  data.setores = await rows('setores', { dateField: null });
  data.users = await rows('users', { dateField: null });
  data.tipos = await rows('tipo_solicitacao', { dateField: null });
  let lastId = '0';
  while (true) {
    const batch = await rows('solicitacoes', { sinceId: lastId, root: true });
    if (!batch.length) break;
    data.solicitacoes.push(...batch);
    if (data.solicitacoes.length > options.maxRequests) throw new Error('Limite de solicitacoes atingido. Amplie o limite ou use IDs explicitos; nenhuma amostra silenciosa.');
    const ids = batch.map((r) => String(r.id));
    data.historicos.push(...await rows('historicos', { field: 'solicitacao_id', ids }));
    data.criacoes_auditadas.push(...await rows('security_event_logs', { field: 'recurso_id', ids }));
    data.status_area.push(...await rows('status_area', { field: 'solicitacao_id', ids }));
    data.anexos.push(...await rows('anexos', { field: 'solicitacao_id', ids }));
    const compras = await rows('solicitacao_compras', { field: 'solicitacao_principal_id', ids });
    data.compras.push(...compras);
    const pedidos = await rows('pedido_compras', { field: 'solicitacao_compra_id', ids: compras.map((r) => String(r.id)) });
    data.pedidos.push(...pedidos);
    data.compras_logs.push(...await rows('solicitacao_compra_logs', { field: 'solicitacao_compra_id', ids: compras.map((r) => String(r.id)) }));
    const titulos = await rows('titulos_financeiros', { field: 'solicitacao_id', ids });
    data.titulos.push(...titulos);
    data.movimentos.push(...await rows('movimentos_financeiros', { field: 'titulo_financeiro_id', ids: titulos.map((r) => String(r.id)) }));
    const fila = await rows('pagamentos_manuais_fila', { field: 'titulo_financeiro_id', ids: titulos.map((r) => String(r.id)) });
    const contratos = await rows('contratos', { field: 'solicitacao_id', ids });
    data.fila.push(...fila); data.contratos.push(...contratos);
    // Filtro por IDs candidatos e resolucao por rota no motor, nunca por coincidencia numerica isolada.
    const resourceIds = [...new Set([...ids, ...compras.map((r) => String(r.id)), ...pedidos.map((r) => String(r.id)), ...titulos.map((r) => String(r.id)), ...fila.map((r) => String(r.id)), ...contratos.map((r) => String(r.id))])];
    for (let i = 0; i < resourceIds.length; i += 500) data.operacionais.push(...await rows('governanca_eventos_operacionais', { field: 'recurso_id', ids: resourceIds.slice(i, i + 500), dateField: 'ocorrido_em' }));
    lastId = String(batch.at(-1).id);
    if (options.progress) options.progress(data.solicitacoes.length);
  }
  // Um ID pode aparecer em lotes distintos e em recursos diferentes: a chave real e o ID do evento.
  data.operacionais = [...new Map(data.operacionais.map((r) => [String(r.id), r])).values()];
  const audit = schema.get('governanca_eventos_operacionais');
  let coverage = [];
  if (audit && ['ocorrido_em', 'recurso_tipo', 'categoria', 'resultado'].every((c) => audit.columns.has(c))) {
    coverage = await read(`SELECT recurso_tipo, categoria, resultado, COUNT(*) AS quantidade, MIN(ocorrido_em) AS primeiro, MAX(ocorrido_em) AS ultimo FROM ${quote(audit.name)} WHERE ocorrido_em >= ? AND ocorrido_em < ? GROUP BY recurso_tipo, categoria, resultado`, [options.sinceSql, options.cutoffSql]);
  }
  const records = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length]));
  if (clock) data.corte_servidor = clock.corte_servidor;
  return { data, manifest: { relogio_banco: clock,
    tipos_temporais: schemaRows.filter((r) => SPECS[r.TABLE_NAME.toLowerCase()]?.some((c) => c.toLowerCase() === r.COLUMN_NAME.toLowerCase()) && ['datetime', 'timestamp'].includes(r.DATA_TYPE)).map((r) => ({ tabela: r.TABLE_NAME, coluna: r.COLUMN_NAME, tipo: r.DATA_TYPE })),
    linhas_lidas_por_fonte: sourceCounts, registros_unicos_extraidos: records, cobertura_auditoria_no_periodo: coverage,
    avisos: [...new Map(warnings.map((w) => [JSON.stringify(w), w])).values()],
    tabelas_consultadas: Object.keys(sourceCounts), consultas: sqlLog.length }, sqlLog };
}
module.exports = { extract, buildSchema, projection, quote, SPECS };
