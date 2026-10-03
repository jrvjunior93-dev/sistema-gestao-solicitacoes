'use strict';
// Inspeção estrutural e repetição do runner em memória; não executa SQL MySQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const runner = fs.readFileSync(path.join(__dirname, '../src/database/runMigrations.js'), 'utf8');
const patternsSource = runner.slice(runner.indexOf('const DATA_MUTATION_PATTERNS'), runner.indexOf('\nasync function ensureMigrationsTable'));
const patterns = vm.runInNewContext(`${patternsSource}; DATA_MUTATION_PATTERNS`);
const file = '../migrations/202609180002_titulos_renegociacao';
const source = fs.readFileSync(require.resolve(file), 'utf8');
assert.equal(patterns.find(p => p.pattern.test(source)), undefined, 'migration deve passar na guarda estrutural real');
const columns = {}, tables = new Set(), triggers = new Set(), ddl = [];
const sequelize = {
  getQueryInterface: () => ({ describeTable: async () => ({ ...columns }) }),
  query: async (sql, options = {}) => {
    if (sql.includes('information_schema.TABLES')) return [[{ total: tables.has(options.replacements[0]) ? 1 : 0 }]];
    if (sql.includes('information_schema.TRIGGERS')) return [triggers.has(options.replacements[0]) ? [{ TRIGGER_NAME: options.replacements[0] }] : []];
    const table = sql.match(/^CREATE TABLE (\w+)/);
    const column = sql.match(/^ALTER TABLE titulos_financeiros ADD COLUMN (\w+)/);
    const trigger = sql.match(/^CREATE TRIGGER (\w+)/);
    assert.ok(table || column || trigger, `SQL não estrutural ou inesperado: ${sql}`);
    if (table) tables.add(table[1]);
    if (column) columns[column[1]] = {};
    if (trigger) triggers.add(trigger[1]);
    ddl.push(sql); return [[], {}];
  }
};
async function main() {
  await require(file).up({ sequelize });
  assert.equal(tables.size, 2); assert.equal(Object.keys(columns).length, 4); assert.equal(triggers.size, 2);
  assert.ok(ddl.some(sql => sql.includes('BEFORE DELETE') && sql.includes('SIGNAL SQLSTATE')));
  assert.ok(ddl.some(sql => sql.includes('BEFORE UPDATE') && sql.includes('OLD.renegociado_por_id')));
  const count = ddl.length;
  await require(file).up({ sequelize });
  assert.equal(ddl.length, count, 'segunda execução não deve repetir DDL');
  console.log('OK: migration somente estrutural aceita pela guarda do runner; repetição idempotente; triggers previstas. SQL não executado em MySQL.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
