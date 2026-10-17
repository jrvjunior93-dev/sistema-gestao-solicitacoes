'use strict';
// Node24/SQLite em memoria: executa a CTE real; adapta SOMENTE a sintaxe do
// JSON_ARRAYAGG. Nao e um ensaio MySQL/EXPLAIN e nao usa banco/arquivo externo.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { Op } = require('sequelize');
const { listarObras, listarTitulos, consulta } = require('../src/services/pagamentoAutorizacaoConsultaService');
const { situacaoItem, projetarLotesAtuais } = require('../src/services/pagamentoAutorizacaoSituacao');
const sqlite = new DatabaseSync(':memory:'); sqlite.function('NOW', () => '2026-10-17 12:00:00');
sqlite.exec(`CREATE TABLE pagamento_autorizacao_itens (id INTEGER PRIMARY KEY,lote_id INTEGER,titulo_financeiro_id INTEGER,status TEXT,valor_snapshot REAL,vencimento_snapshot TEXT);
CREATE TABLE pagamento_autorizacao_lotes (id INTEGER PRIMARY KEY,status TEXT,expira_em TEXT);
CREATE TABLE titulos_financeiros (id INTEGER PRIMARY KEY,status TEXT,renegociado_por_id INTEGER,renegociacao_id INTEGER,compartilhamento_id INTEGER,obra_id INTEGER,valor_baixado REAL,valor_saldo REAL,data_vencimento TEXT,deleted_at TEXT);
CREATE TABLE pagamentos_manuais_fila (id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER,status TEXT,motivo TEXT);
CREATE TABLE titulos_compartilhados_origens (titulo_financeiro_id INTEGER,obra_id INTEGER,valor REAL);
CREATE TABLE titulo_renegociacao_alocacoes (titulo_destino_id INTEGER,obra_id INTEGER,valor REAL);
CREATE TABLE titulos_financeiros_rateios (titulo_financeiro_id INTEGER,obra_id INTEGER,valor_rateio REAL);
CREATE TABLE obras (id INTEGER PRIMARY KEY,nome TEXT);`);
const inserir = (t, o) => sqlite.prepare(`INSERT INTO ${t} (${Object.keys(o)}) VALUES (${Object.keys(o).map(() => '?')})`).run(...Object.values(o));
const itens = [];
for (let i = 1; i <= 650; i++) {
  if (i <= 151) inserir('obras', { id: i, nome: 'Obra ' + String(i).padStart(3, '0') });
  inserir('pagamento_autorizacao_lotes', { id: i, status: 'AGUARDANDO', expira_em: '2099-01-01' });
  const titulo = { id: i, status: 'ABERTO', valor_baixado: 0, valor_saldo: 100, obra_id: (i % 150) + 1, data_vencimento: '2026-10-17' };
  inserir('titulos_financeiros', titulo);
  const item = { id: i, lote_id: i, titulo_financeiro_id: i, status: 'PENDENTE', valor_snapshot: 100, vencimento_snapshot: '2026-10-17' };
  inserir('pagamento_autorizacao_itens', item); itens.push({ ...item, titulo, snapshot_hash: 'assinado', lote: { id: i, status: 'AGUARDANDO', expira_em: '2099-01-01' } });
}
function mudar(id, campos) { for (const [key, value] of Object.entries(campos)) { sqlite.prepare(`UPDATE titulos_financeiros SET ${key}=? WHERE id=?`).run(value, id); itens.find(i => i.titulo_financeiro_id === id).titulo[key] = value; } }
function executar(sql, { replacements = {} } = {}) {
  assert(/^(WITH|SELECT) /.test(sql)); assert(!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP)\s/i.test(sql));
  sql = sql.replaceAll('JSON_ARRAYAGG(', 'JSON_GROUP_ARRAY(');
  const params = { ...replacements };
  if (params.ids) { sql = sql.replace(':ids)', params.ids.map((_, i) => ':id_' + i).join(',') + ')'); params.ids.forEach((v, i) => params['id_' + i] = v); delete params.ids; }
  if (params.lotes) { sql = sql.replace(':lotes)', params.lotes.map((_, i) => ':lote_' + i).join(',') + ')'); params.lotes.forEach((v, i) => params['lote_' + i] = v); delete params.lotes; }
  const nomes = [...new Set([...sql.matchAll(/:([a-z_][a-z_0-9]*)/gi)].map(m => m[1]))];
  return sqlite.prepare(sql).all(Object.fromEntries(nomes.map(n => [n, params[n]])));
}
const db = { sequelize: { query: async (sql, options) => executar(sql, options) }, PagamentoAutorizacaoItem: {
  findAll: async options => itens.filter(i => options.where.id[Op.in].includes(i.id))
} };
(async () => { try {
  const todas = await listarObras({}, db); assert.equal(todas.resumo.quantidade_titulos, 650); assert.equal(todas.resumo.valor_total, 65000); assert.equal(todas.paginacao.total, 150);
  const obras = []; for (let pagina = 1; pagina <= 5; pagina++) obras.push(...(await listarObras({ pagina: String(pagina) }, db)).data);
  assert.equal(new Set(obras.map(o => o.obra_id)).size, 150);
  const ids = []; for (let pagina = 1; pagina <= 13; pagina++) ids.push(...(await listarTitulos({ pagina: String(pagina), limite: '50' }, db)).data.map(i => i.id));
  assert.equal(ids.length, 650); assert.equal(new Set(ids).size, 650);
  const f = await listarObras({ obra: 'Obra 150', vencimento_inicio: '2026-10-17', vencimento_fim: '2026-10-17' }, db);
  assert.equal(f.paginacao.total, 1); assert.equal(f.resumo.quantidade_titulos, 4); assert.equal(f.resumo.valor_total, 400);
  assert.equal((await listarObras({ obra: '%' }, db)).resumo.quantidade_titulos, 0, 'Busca literal, sem wildcard');
  mudar(1, { status: 'QUITADO', valor_baixado: 100, valor_saldo: 0 }); mudar(2, { status: 'PARCIAL', valor_baixado: 30, valor_saldo: 70 });
  itens[2].status = 'ENFILEIRADO'; sqlite.prepare("UPDATE pagamento_autorizacao_itens SET status='ENFILEIRADO' WHERE id=3").run();
  inserir('pagamentos_manuais_fila', { id: 1, titulo_financeiro_id: 3, status: 'NAO_PAGO', motivo: 'Banco recusou' });
  assert.equal((await listarTitulos({ situacao: 'QUITADO' }, db)).data[0].titulo_financeiro_id, 1);
  assert.equal((await listarTitulos({ situacao: 'PARCIALMENTE_PAGO' }, db)).data[0].titulo_financeiro_id, 2);
  assert((await listarTitulos({ situacao: 'AGUARDANDO', item_ids: '2' }, db)).data.some(i => i.titulo_financeiro_id === 2), 'Saldo parcial com dossie pendente nao fica escondido');
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO' }, db)).paginacao.total, 1);
  inserir('pagamentos_manuais_fila', { id: 2, titulo_financeiro_id: 3, status: 'PENDENTE' });
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO' }, db)).paginacao.total, 0);
  assert.equal((await listarTitulos({ situacao: 'NA_FILA' }, db)).data[0].situacao_financeira, 'NA_FILA');
  sqlite.prepare("UPDATE pagamento_autorizacao_itens SET status='ENFILEIRADO' WHERE id=2").run(); itens[1].status = 'ENFILEIRADO';
  inserir('pagamentos_manuais_fila', { id: 3, titulo_financeiro_id: 2, status: 'NAO_PAGO' });
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO', item_ids: '2' }, db)).data[0].situacao_financeira, 'PARCIALMENTE_PAGO', 'Filtro pela tentativa nao apaga o pagamento parcial');
  // Estorno volta a refletir a fila, sem reescrever a autorizacao.
  mudar(1, { status: 'ABERTO', valor_baixado: 0, valor_saldo: 100 });
  assert.equal((await listarTitulos({ situacao: 'QUITADO' }, db)).paginacao.total, 0);
  // Mesmo titulo em outro dossie conta apenas a autorizacao mais recente.
  inserir('pagamento_autorizacao_itens', { id: 1001, lote_id: 1, titulo_financeiro_id: 1, status: 'PENDENTE', valor_snapshot: 100 });
  itens.push({ ...itens[0], id: 1001 });
  assert.equal((await listarObras({}, db)).resumo.quantidade_titulos, 650);
  // Compartilhado e renegociado, varias origens na mesma obra, centavos residuais.
  mudar(4, { compartilhamento_id: 8, obra_id: null });
  for (const obra_id of [1, 1, 2, 3]) inserir('titulos_compartilhados_origens', { titulo_financeiro_id: 4, obra_id, valor: 25 });
  mudar(5, { renegociacao_id: 5, obra_id: null });
  for (const obra_id of [1, 2, 3]) inserir('titulo_renegociacao_alocacoes', { titulo_destino_id: 5, obra_id, valor: 1 });
  const a = await listarObras({ item_ids: '4,5' }, db); assert.equal(a.resumo.quantidade_titulos, 2); assert.equal(a.resumo.valor_total, 200);
  const b = await listarTitulos({ item_ids: '4,5', obra_id: '1' }, db); assert.equal(b.data.length, 2); assert.equal(b.data[0].valor_no_recorte + b.data[1].valor_no_recorte, 83.33);
  assert.equal((await listarObras({ item_ids: '4,5', obra_id: '2' }, db)).resumo.valor_total, 58.33);
  const bruto = consulta({}); const matriz = executar(bruto.cte + ' SELECT * FROM situados', { replacements: bruto.replacements });
  for (const row of matriz) {
    const item = itens.find(i => i.id === row.id); const j = situacaoItem({ ...item, fila_atual: row.fila_id ? { status: row.fila_status } : null }, new Date('2026-10-17T12:00:00Z'));
    assert.equal(row.situacao_financeira, j, 'SQL/JS coerentes item ' + row.id);
  }
  const loteAtual = await projetarLotesAtuais([{ id: 3, status: 'CONCLUIDO', itens: [{ ...itens[2], fila_item_id: 1 }] }], db.sequelize);
  assert.equal(loteAtual[0].itens[0].fila_atual.id, 2, 'Historico por lote tambem usa ultimo ciclo, nao a fila antiga');
  assert.equal(loteAtual[0].itens[0].fila_item_id, 1);
  assert.equal((await listarTitulos({ pagina: '99' }, db)).paginacao.total, 650);
  console.log('CTE real em SQLite memoria (JSON_ARRAYAGG adaptado): 650 titulos/150 obras, todas as paginas, filtros anteriores ao limite, pagamentos/estorno/ultima fila, dossie mais recente, rateios/renegociados/compartilhados e centavos sem duplicidade aprovados. Nao substitui MySQL/EXPLAIN DEV.');
} finally { sqlite.close(); } })().catch(e => { console.error(e); process.exitCode = 1; });
