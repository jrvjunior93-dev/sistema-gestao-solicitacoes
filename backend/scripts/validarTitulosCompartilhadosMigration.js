'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DataTypes } = require('sequelize');
const tables = new Map(), columns = new Set(), indexes = new Set(), ops = [];
const helpers = { tableExists: async (_, name) => tables.has(name), columnExists: async (_, table, column) => columns.has(`${table}:${column}`),
  indexExists: async (_, table, index) => indexes.has(`${table}:${index}`), resolveTableName: async (_, names) => names[0] };
const moduleFixture = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../migrations/202610160001_titulos_compartilhados.js'), 'utf8');
assert(!/\b(?:bulkInsert|bulkUpdate|bulkDelete|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|DROP TABLE)\b/i.test(source));
vm.runInNewContext(source, { module: moduleFixture, require: name => { assert.equal(name, '../src/database/schemaUtils'); return helpers; } });
const qi = {
  createTable: async (name, attrs) => { assert(!tables.has(name)); tables.set(name, attrs); ops.push(['createTable', name]); },
  addColumn: async (table, column, attrs) => { assert.equal(attrs.references.model, 'titulos_compartilhados_lotes'); columns.add(`${table}:${column}`); ops.push(['addColumn', table]); },
  addIndex: async (table, fields, { name, unique }) => { indexes.add(`${table}:${name}`); ops.push(['addIndex', table]); if (name === 'uq_tc_lote_chave') assert.equal(unique, true); }
};
(async () => {
  const args = { queryInterface: qi, sequelize: {}, DataTypes };
  await moduleFixture.exports.up(args); const n = ops.length; await moduleFixture.exports.up(args);
  assert.equal(ops.length, n, 'Retomada não recria tabelas, campos ou índices');
  assert.equal(tables.size, 2); assert.equal(indexes.size, 7);
  const origem = tables.get('titulos_compartilhados_origens');
  for (const c of ['lote_id', 'titulo_financeiro_id', 'solicitacao_id', 'empresa_id', 'obra_id', 'valor']) assert.equal(origem[c].allowNull, false);
  for (const c of ['lote_id', 'titulo_financeiro_id', 'solicitacao_id', 'pedido_compra_id']) assert.equal(origem[c].onDelete, 'RESTRICT');
  await assert.rejects(moduleFixture.exports.down(), /auditoria/);
  console.log('Schema compartilhado: somente DDL, identidade preservada, FKs RESTRICT, índices, retomada idempotente e rollback não destrutivo aprovados. Sem banco.');
})().catch(e => { console.error(e); process.exitCode = 1; });
