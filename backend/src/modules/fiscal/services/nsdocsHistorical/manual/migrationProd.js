'use strict';
const fs = require('node:fs'), path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');
const { check } = require('./policy');
const { getRdsSsl } = require('./rdsTls');
const { withProdReadDatabase, assertProdProcess, confirmWrite } = require('./runtime');
const { MIGRATION, inspectSchema } = require('./repository');
const DIRECTORY = path.resolve(__dirname, '../../../../../../migrations');
const TABLES = ['fiscal_nsdocs_captures', 'fiscal_nsdocs_capture_events', 'fiscal_nsdocs_observations'];

async function schemaState(db) {
  const [rows] = await db.execute('SELECT name FROM schema_migrations ORDER BY name');
  const executed = new Set(rows.map(row => row.name));
  const files = fs.readdirSync(DIRECTORY).filter(file => file.endsWith('.js')).sort();
  const pending = files.filter(file => !executed.has(file));
  check(pending.length === 0 || pending.length === 1 && pending[0] === MIGRATION,
    'NSDOCS_SCHEMA_OUTRAS_MIGRATIONS_PENDENTES');
  return { pending, applied: executed.has(MIGRATION) };
}
function assertStructuralSql(sql) {
  const statement = typeof sql === 'string' ? sql : sql?.query;
  const target = TABLES.some(table => new RegExp('^(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE) `?' + table + '`?\\b', 'i').test(statement || ''));
  // ON DELETE/UPDATE nas FKs e DDL; nao confundir com comandos DML.
  const withoutForeignActions = String(statement || '').replace(/\bON (?:DELETE|UPDATE) (?:RESTRICT|CASCADE|SET NULL|NO ACTION)\b/gi, '');
  check(typeof statement === 'string' && !/;\s*\S/.test(statement) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|LOAD|MERGE)\b/i.test(withoutForeignActions) &&
    (/^\s*(SELECT|SHOW)\b/i.test(statement) || target), 'NSDOCS_MIGRATION_SQL_FORA_DO_ESCOPO');
}
async function applyOnConnection(sequelize, dependencies = {}) {
  const query = sequelize.query.bind(sequelize);
  let locked = false;
  try {
    const [tls] = await query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    check(tls[0]?.Value, 'NSDOCS_SESSAO_MYSQL_SEM_TLS');
    const [[identity]] = await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    check(identity.uuid === '5ed4b970-009f-11f1-809c-0ad0e0c90c53' && identity.banco === 'gestao_solicitacoes', 'NSDOCS_BANCO_PROD_DIVERGENTE');
    const [[lock]] = await query("SELECT GET_LOCK('fluxy_nsdocs_historical_schema_prod', 0) AS acquired");
    check(Number(lock?.acquired) === 1, 'NSDOCS_MIGRATION_OCUPADA'); locked = true;
    // A mesma conexao (poolmax1) conserva o lock ate fechar; sem chamadas externas.
    const [rows] = await query('SELECT name FROM schema_migrations ORDER BY name');
    const executed = new Set(rows.map(row => row.name));
    const files = (dependencies.files || fs.readdirSync(DIRECTORY)).filter(file => file.endsWith('.js'));
    const pending = files.filter(file => !executed.has(file));
    check(pending.every(file => file === MIGRATION), 'NSDOCS_SCHEMA_OUTRAS_MIGRATIONS_PENDENTES');
    // Inclusive no replay, validar/reparar somente a estrutura idempotente desta migration.
    sequelize.query = async (sql, ...args) => { assertStructuralSql(sql); return query(sql, ...args); };
    const migration = dependencies.migration || require(path.join(DIRECTORY, MIGRATION));
    await migration.up({ sequelize, queryInterface: sequelize.getQueryInterface(), DataTypes });
    sequelize.query = query;
    // DDL MySQL nao tem rollback: nao registrar ledger de uma forma parcial.
    await inspectSchema({ execute: (sql,args) => query(sql,{replacements:args}) });
    if (!executed.has(MIGRATION)) {
      await query('INSERT INTO schema_migrations (name) VALUES (?)', { replacements: [MIGRATION] });
    }
    return { applied_now: !executed.has(MIGRATION), migration: MIGRATION };
  } finally {
    sequelize.query = query;
    if (locked) await query("SELECT RELEASE_LOCK('fluxy_nsdocs_historical_schema_prod') AS released");
  }
}
async function migrateProd(dependencies = {}) {
  (dependencies.guard || assertProdProcess)();
  (dependencies.confirmWrite || confirmWrite)('schema');
  await (dependencies.readDatabase || withProdReadDatabase)(schemaState);
  const { env } = require('../../../../../config/env');
  const sequelize = new Sequelize(env.dbName, env.dbUser, env.dbPassword, {
    host: env.dbHost, port: env.dbPort, dialect: 'mysql', logging: false,
    pool: { max: 1, min: 0, idle: 600000, acquire: 15000 },
    dialectOptions: { connectTimeout: 10000, ssl: { ...getRdsSsl() } }
  });
  try { return await applyOnConnection(sequelize); }
  finally { await sequelize.close(); }
}
module.exports = { MIGRATION, DIRECTORY, TABLES, schemaState, assertStructuralSql, applyOnConnection, migrateProd };
