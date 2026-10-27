'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { Sequelize } = require('sequelize');
const { ambiente, banco } = require('./validarOfxMatchesExclusivos');
const { validateFinanceConciliacaoQuery: query, validateFinanceConciliacaoConciliarSugeridosBody: body } = require('../src/validators/financialValidators');
const req = { user: { id: 1 }, originalUrl: '/qa-local' };

test('validacao aceita natureza fechada na consulta e lote, preservando contrato anterior', () => {
  for (const validate of [query, body]) {
    for (const natureza of ['TODOS', 'CREDITO', 'DEBITO']) assert.equal(validate({ natureza }).natureza, natureza);
    assert.equal(validate({}).natureza, undefined);
    for (const natureza of ['PIX', 'CREDITO OR 1=1', ['CREDITO'], {}]) assert.throws(() => validate({ natureza }));
    assert.throws(() => validate({ natureza: 'CREDITO', sql: 'livre' }));
    assert.throws(() => validate({ data_inicial: '2026-10-28', data_final: '2026-10-27' }));
  }
});

test('service real filtra sinal antes resumo/count/pagina, combina filtros e nao escreve', async () => {
  const rows = Array.from({ length: 241 }, (_, i) => ({ ...banco(i + 1), valor: i < 120 ? -10 : 20 }));
  rows.push({ ...banco(242), valor: 0 }, { ...banco(243), valor: 7, status: 'CONCILIADO' },
    { ...banco(244), valor: -5, conta_bancaria_id: 99 }, { ...banco(245), valor: 4, data_movimento: '2026-10-01' },
    { ...banco(246), valor: 8, deleted_at: '2026-10-27' });
  const a = ambiente(rows, []), before = JSON.stringify(a.stores);
  const filters = { status: 'PENDENTE', conta_bancaria_id: '9', data_inicial: '2026-10-22', data_final: '2026-10-22', page_size: '25' };
  const credits = await a.service.listarConciliacoes(req, query({ ...filters, natureza: 'CREDITO', page: '2' }));
  assert.equal(credits.resumo.total, 121); assert.equal(credits.resumo.valor_total, 2420);
  assert.equal(credits.meta.filtro_natureza_disponivel, true);
  assert.equal(credits.meta.total_pages, 5); assert.equal(credits.itens.length, 25);
  assert(credits.itens.every(r => r.valor > 0)); assert.equal(credits.itens[0].id, 146);
  const debits = await a.service.listarConciliacoes(req, query({ ...filters, natureza: 'DEBITO' }));
  assert.equal(debits.resumo.total, 120); assert.equal(debits.resumo.valor_total, -1200);
  const all = await a.service.listarConciliacoes(req, query(filters));
  assert.equal(all.resumo.total, 242); assert.equal(all.resumo.valor_total, 1220);
  assert.equal(all.resumo.valor_absoluto_total, 3620);
  const done = await a.service.listarConciliacoes(req, query({ ...filters, natureza: 'CREDITO', status: 'CONCILIADO' }));
  assert.equal(done.resumo.total, 1); assert.equal(done.itens[0].id, 243);
  await assert.rejects(a.service.listarConciliacoes({ user: { allow: false } }, { natureza: 'DEBITO' }), { statusCode: 403 });
  await assert.rejects(a.service.listarConciliacoes(req, { natureza: 'INVALIDO' }), { statusCode: 400 });
  assert.equal(JSON.stringify(a.stores), before);

  // SQL MySQL realmente gerado, executado tambem no SQLite em memoria.
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  const sqlDb = new DatabaseSync(':memory:');
  try {
    sqlDb.exec('CREATE TABLE conciliacoes(id INTEGER,valor REAL,status TEXT,deleted_at TEXT,conta_bancaria_id INTEGER,data_movimento TEXT)');
    const insert = sqlDb.prepare('INSERT INTO conciliacoes VALUES(?,?,?,?,?,?)');
    for (const r of rows) insert.run(r.id, r.valor, r.status, r.deleted_at, r.conta_bancaria_id, r.data_movimento);
    const option = a.queries.find(q => q.name === 'ConciliacaoBancaria' && q.options.limit === 25 && q.options.offset === 25).options;
    const sql = sequelize.getQueryInterface().queryGenerator.selectQuery('conciliacoes', {
      attributes: ['id'], where: option.where, limit: option.limit, offset: option.offset, order: [['id', 'ASC']]
    });
    assert.match(sql, /[>] 0/); assert.match(sql, /LIMIT 25, 25/); assert.match(sql, /^SELECT /);
    assert.deepEqual(sqlDb.prepare(sql).all().map(r => r.id), Array.from(credits.itens, r => r.id));
  } finally { sqlDb.close(); await sequelize.close(); }
});

test('lote usa o mesmo sinal e forca pendentes sem alcancar a outra natureza', async () => {
  const a = ambiente([{ ...banco(1), valor: 20 }, banco(2), { ...banco(3), valor: 20, status: 'CONCILIADO' }], []);
  const before = JSON.stringify(a.stores);
  const result = await a.service.conciliarSugeridos(req, body({ natureza: 'CREDITO', status: 'TODOS' }));
  assert.equal(result.resumo.total_avaliadas, 1); assert.equal(result.resumo.total_conciliadas, 0);
  assert.equal(result.resumo.sem_sugestao, 1); assert.equal(JSON.stringify(a.stores), before);
});
