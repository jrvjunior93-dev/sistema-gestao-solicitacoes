'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Sequelize, DataTypes } = require('sequelize'), s = require('./fiscalVinculosProdSchema');
const columns = [ { COLUMN_NAME: 'purchase_link_key', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 100, IS_NULLABLE: 'YES' },
  { COLUMN_NAME: 'allocated_value', DATA_TYPE: 'decimal', NUMERIC_PRECISION: 14, NUMERIC_SCALE: 2, IS_NULLABLE: 'YES' } ];
const indices = ['fiscal_dfe_document_id','purchase_link_key'].map((COLUMN_NAME, i) => ({ INDEX_NAME: 'ux_fiscal_purchase_link', COLUMN_NAME,
  NON_UNIQUE: 0, SEQ_IN_INDEX: i + 1, SUB_PART: null }));
function fixture({ uuid = true, tls = true, extra = false, ddlFail = false, partialWrong = false, registeredWrong = false } = {}) {
  let applied = registeredWrong, complete = false; const calls = [];
  const db = { async query(sql, args) {
    calls.push(sql);
    if (sql.includes('server_uuid')) return [[{ uuid: uuid ? '5ed4b970-009f-11f1-809c-0ad0e0c90c53' : 'DEV_UUID', banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW SESSION')) return [[{ Variable_name: 'Ssl_cipher', Value: tls ? 'QA_TLS' : '' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT name')) return [[{ name: 'base.js' }, ...(applied ? [{ name: s.NAME }] : [])]];
    if (sql.includes('information_schema.COLUMNS')) return [complete ? columns : partialWrong ? [{ ...columns[0], CHARACTER_MAXIMUM_LENGTH: 20 }] : []];
    if (sql.includes('information_schema.STATISTICS')) return [complete ? indices : []];
    if (sql.startsWith('INSERT INTO schema_migrations')) { assert.deepEqual(args.replacements, [s.NAME]); applied = true; }
    return [[]];
  }, getQueryInterface() { return { sequelize: db }; } };
  const migration = { async up(qi) { if (ddlFail) throw Error('QA_DDL_FAIL');
    await qi.sequelize.query('ALTER TABLE `fiscal_document_links` ADD `purchase_link_key` VARCHAR(100);'); complete = true; } };
  return { db, calls, deps: { files: ['base.js', s.NAME, ...(extra ? ['unexpected.js'] : [])], migration, DataTypes } };
}
test('aceita DDL real MySQL e recusa mutacoes/segunda instrucao/coluna ou indice fora do alvo', () => {
  const db = new Sequelize('qa', 'qa', 'ficticio', { dialect: 'mysql', logging: false }), g = db.getQueryInterface().queryGenerator;
  for (const [name, type] of [['purchase_link_key', DataTypes.STRING(100)], ['allocated_value', DataTypes.DECIMAL(14,2)]])
    s.structuralSql(g.addColumnQuery('fiscal_document_links', name, { type, allowNull: true }));
  s.structuralSql(g.addIndexQuery('fiscal_document_links', ['fiscal_dfe_document_id','purchase_link_key'], { name: 'ux_fiscal_purchase_link', unique: true }));
  for (const sql of ['UPDATE titulos_financeiros SET valor_saldo=0', 'DROP TABLE fiscal_document_links',
    'ALTER TABLE `fiscal_document_links` ADD `purchase_link_key` VARCHAR(100); DROP TABLE titulos_financeiros',
    'ALTER TABLE `fiscal_document_links` ADD `purchase_link_key` VARCHAR(100), ADD indevido INT',
    'ALTER TABLE `titulos_financeiros` ADD `purchase_link_key` VARCHAR(100)',
    'SELECT 1; DELETE FROM fiscal_document_links']) assert.throws(() => s.structuralSql(sql));
});
test('forma completa/nullable/indice composto sem prefixo; schema parcial incorreto bloqueia antes do DDL', async () => {
  assert(s.verifyStructure(columns, indices)); assert(s.verifyStructure([], [], true));
  assert(!s.verifyStructure(columns, [{ ...indices[0], SUB_PART: 5 }, indices[1]]));
  assert(!s.verifyStructure(columns, indices.map(i => ({ ...i, NON_UNIQUE: 1 }))));
  const f = fixture({ partialWrong: true }); await assert.rejects(s.apply(f.db, f.deps));
  assert(!f.calls.some(q => q.startsWith('ALTER'))); assert(f.calls.at(-1).includes('RELEASE_LOCK'));
});
test('somente002 com UUID/TLS PROD; ledger apos schema, replay sem duplicar e lock liberado', async () => {
  const f = fixture(), result = await s.apply(f.db, f.deps); assert(result.applied_now && result.structure_ok && result.applied);
  assert(f.calls.findIndex(q => q.includes('server_uuid')) < f.calls.findIndex(q => q.startsWith('ALTER')));
  assert(f.calls.findIndex(q => q.startsWith('ALTER')) < f.calls.findIndex(q => q.startsWith('INSERT')));
  assert.equal((await s.apply(f.db, f.deps)).applied_now, false);
  assert.equal(f.calls.filter(q => q.startsWith('INSERT')).length, 1); assert(f.calls.at(-1).includes('RELEASE_LOCK'));
});
test('DEV UUID, TLS ausente, outra pendente, schema/ledger divergente e falha DDL nao registram migration', async () => {
  for (const options of [{ uuid: false }, { tls: false }, { extra: true }, { ddlFail: true }, { registeredWrong: true }]) {
    const f = fixture(options); await assert.rejects(s.apply(f.db, f.deps)); assert(!f.calls.some(q => q.startsWith('INSERT')));
    if (!options.ddlFail) assert(!f.calls.some(q => q.startsWith('ALTER')));
  }
});
test('migration real e repetivel/aditiva; retorno nao apaga vinculos ou historico', async () => {
  const migration = require('../migrations/' + s.NAME), cols = {}, idx = []; const changes = [];
  const qi = { async describeTable() { return cols; }, async showIndex() { return idx; },
    async addColumn(table, column, config) { assert.equal(table, 'fiscal_document_links'); assert.equal(config.allowNull, true); cols[column] = config; changes.push(column); },
    async addIndex(table, fields, config) { assert.equal(table, 'fiscal_document_links'); assert.deepEqual(fields, ['fiscal_dfe_document_id','purchase_link_key']); assert(config.unique); idx.push({ name: config.name }); changes.push(config.name); } };
  await migration.up(qi, DataTypes); await migration.up(qi, DataTypes);
  assert.deepEqual(changes, ['purchase_link_key','allocated_value','ux_fiscal_purchase_link']); await assert.rejects(migration.down());
});
