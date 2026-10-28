'use strict';
// CLI exclusiva PROD. Estrutura aditiva nomeada, sem modelos ou runner geral.
const fs = require('node:fs'), path = require('node:path');
const NAME = '202610280001_rh_privacidade_obra.js';
const migration = require('../migrations/' + NAME);
const check = (ok, code) => { if (!ok) throw Error(code); };
const normalize = sql => String(sql).trim().replace(/;$/, '');
const COLUMNS = [
  ['rh_colaboradores', 'salario_restrito_obra', 'tinyint(1)', false, '0'],
  ['rh_documentos', 'obra_origem_id', 'int', true, null],
  ['rh_documentos', 'chave_envio_obra', 'varchar(140)', true, null]
];
const INDEXES = [
  ['rh_colaboradores', 'rh_colaborador_salario_restrito_obra_idx', ['salario_restrito_obra', 'obra_id', 'id'], false],
  ['rh_documentos', 'rh_documento_envio_obra_uk', ['colaborador_id', 'chave_envio_obra'], true]
];
async function identity(query) {
  const [[id]] = await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  check(id?.uuid === '5ed4b970-009f-11f1-809c-0ad0e0c90c53' && id.banco === 'gestao_solicitacoes', 'RH_PRIV_PROD_BANCO_DIVERGENTE');
  const [tls] = await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  check(tls.some(r => r.Variable_name === 'Ssl_cipher' && r.Value) && tls.some(r => r.Variable_name === 'Ssl_version' && /^TLSv1\.[23]$/.test(r.Value)), 'RH_PRIV_PROD_TLS_OBRIGATORIO');
}
async function structure(query) {
  const [cols] = await query("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('rh_colaboradores','rh_documentos')");
  // Tabelas preexistentes obrigatorias: esta entrega nunca as cria/recria.
  for (const table of ['rh_colaboradores', 'rh_documentos']) check(cols.some(c => c.TABLE_NAME === table && c.COLUMN_NAME === 'id'), 'RH_PRIV_PROD_TABELA_BASE_AUSENTE');
  const missing = [];
  for (const [table, name, type, nullable, def] of COLUMNS) {
    const c = cols.find(c => c.TABLE_NAME === table && c.COLUMN_NAME === name);
    if (!c) { missing.push(table + '.' + name); continue; }
    check(String(c.COLUMN_TYPE).toLowerCase().replace(/^int\(11\)$/, 'int') === type && c.IS_NULLABLE === (nullable ? 'YES' : 'NO') && (c.COLUMN_DEFAULT == null ? null : String(c.COLUMN_DEFAULT)) === def, 'RH_PRIV_PROD_COLUNA_INCOMPATIVEL');
  }
  for (const [table, name, fields, unique] of INDEXES) {
    const [all] = await query('SHOW INDEX FROM `' + table + '`');
    const rows = all.filter(r => r.Key_name === name).sort((a, b) => a.Seq_in_index - b.Seq_in_index);
    if (!rows.length) { missing.push(name); continue; }
    check(rows.length === fields.length && rows.every((r, i) => r.Column_name === fields[i] && Number(r.Non_unique) === (unique ? 0 : 1) && r.Sub_part == null && Number(r.Seq_in_index) === i + 1 && (r.Visible == null || r.Visible === 'YES')), 'RH_PRIV_PROD_INDICE_INCOMPATIVEL');
  }
  return { structure_ok: missing.length === 0, missing };
}
async function state(query, { files = fs.readdirSync(path.resolve(__dirname, '../migrations')) } = {}) {
  const [rows] = await query('SELECT name FROM schema_migrations ORDER BY name'), executed = new Set(rows.map(r => r.name));
  const pending = files.filter(n => n.endsWith('.js') && !executed.has(n)).sort();
  check(pending.every(n => n === NAME), 'RH_PRIV_PROD_OUTRAS_MIGRATIONS_PENDENTES');
  const shape = await structure(query);
  check(!executed.has(NAME) || shape.structure_ok, 'RH_PRIV_PROD_LEDGER_SCHEMA_DIVERGENTE');
  return { migration: NAME, pending, applied: executed.has(NAME), ...shape };
}
function allowedDdl(db, DataTypes = require('sequelize').DataTypes) {
  const qg = db.getQueryInterface().queryGenerator;
  const shapes = [
    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    { type: DataTypes.INTEGER, allowNull: true }, { type: DataTypes.STRING(140), allowNull: true }
  ];
  const sql = COLUMNS.map(([table, col], i) => qg.addColumnQuery(table, col, db.normalizeAttribute(shapes[i])));
  for (const [table, name, fields, unique] of INDEXES) sql.push(qg.addIndexQuery(table, fields, { name, unique }));
  return new Set(sql.map(normalize));
}
function structuralSql(sql, ddl = new Set()) {
  const text = normalize(sql);
  const read = /^(SELECT|SHOW)\b/i.test(text) && !/[;]|\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK|FOR\s+UPDATE)\b/i.test(text);
  check(read || ddl.has(text), 'RH_PRIV_PROD_DDL_FORA_ESCOPO');
}
async function apply(db, { transaction, files, DataTypes = require('sequelize').DataTypes, migration: runMigration = migration } = {}) {
  check(transaction?.connection, 'RH_PRIV_PROD_CANAL_DEDICADO_OBRIGATORIO');
  const native = db.query.bind(db), query = (sql, options = {}) => native(sql, { ...options, transaction });
  let locked = false;
  try {
    await identity(query);
    const [[lock]] = await query("SELECT GET_LOCK('fluxy_rh_privacidade_obra_prod_schema', 0) AS acquired");
    check(Number(lock?.acquired) === 1, 'RH_PRIV_PROD_SCHEMA_OCUPADO'); locked = true;
    const before = await state(query, { files }), ddl = allowedDdl(db, DataTypes);
    // DDL MySQL tem commit implicito: retomada confere cada coluna/indice,
    // nao promete rollback destrutivo nem tenta remover estrutura parcial.
    db.query = (sql, options = {}) => { structuralSql(typeof sql === 'string' ? sql : sql?.query, ddl); return query(sql, options); };
    await runMigration.up({ queryInterface: db.getQueryInterface(), DataTypes }); db.query = native;
    check((await structure(query)).structure_ok, 'RH_PRIV_PROD_SCHEMA_INCOMPLETO');
    if (!before.applied) await query('INSERT INTO schema_migrations (name) VALUES (?)', { replacements: [NAME] });
    const after = await state(query, { files });
    check(after.applied && after.structure_ok && !after.pending.length, 'RH_PRIV_PROD_SCHEMA_FINAL_DIVERGENTE');
    return { ...after, applied_now: !before.applied };
  } finally {
    db.query = native;
    if (locked) await query("SELECT RELEASE_LOCK('fluxy_rh_privacidade_obra_prod_schema') AS released");
  }
}
async function main(args) {
  check(args.length === 1 && ['--conferir', '--aplicar'].includes(args[0]), 'RH_PRIV_PROD_SCHEMA_ARGUMENTOS_INVALIDOS');
  require('dotenv').config({ quiet: true, override: false });
  const runtime = require('../src/modules/fiscal/services/nsdocsHistorical/manual/runtime'); runtime.assertProdProcess();
  check(!process.env.NODE_OPTIONS && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && !/^(true|1|yes|on)$/i.test(process.env.ALLOW_SCHEMA_MIGRATIONS || ''), 'RH_PRIV_PROD_AMBIENTE_INSEGURO');
  if (args[0] === '--conferir') return runtime.withProdReadDatabase(async db => {
    const query = (sql, options) => { structuralSql(sql); return db.query(sql, options); };
    await identity(query); return state(query);
  });
  check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_RH_PRIVACIDADE_PROD_SCHEMA'].every(k => process.env[k] === 'SIM'), 'RH_PRIV_PROD_CONFIRME_BACKUP_SCHEMA');
  const cp = require('node:child_process');
  check(cp.execFileSync('/usr/bin/git', ['--no-optional-locks', 'branch', '--show-current'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'main', 'RH_PRIV_PROD_BRANCH_DIVERGENTE');
  cp.execFileSync('/usr/bin/systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer'], { timeout: 5000, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
  const { env, validateRequiredEnv } = require('../src/config/env'); validateRequiredEnv();
  require('../src/modules/fiscal/services/nsdocsHistorical/manual/policy').validateFlags(require('dotenv').parse(fs.readFileSync('.env')));
  const { Sequelize } = require('sequelize'), { getRdsSsl } = require('../src/modules/fiscal/services/nsdocsHistorical/manual/rdsTls');
  const db = new Sequelize(env.dbName, env.dbUser, env.dbPassword, { host: env.dbHost, port: env.dbPort, dialect: 'mysql', logging: false,
    pool: { max: 1, min: 0, acquire: 15000 }, dialectOptions: { connectTimeout: 10000, ssl: { ...getRdsSsl() } } });
  try { return await db.transaction(transaction => apply(db, { transaction })); } finally { await db.close(); }
}
module.exports = { NAME, COLUMNS, INDEXES, identity, structure, state, allowedDdl, structuralSql, apply, main };
if (require.main === module) main(process.argv.slice(2)).then(r => console.log(JSON.stringify({ outcome: 'RH_PRIVACIDADE_SCHEMA_PROD', ...r,
  financial_data_writes: 0, business_data_writes: 0, external_calls: 0 }))).catch(e => {
  console.error(/^RH_PRIV_PROD_[A-Z0-9_]+$/.test(e.message || '') ? e.message : 'RH_PRIV_PROD_SCHEMA_INTERROMPIDO_SEM_SEGREDOS'); process.exitCode = 1;
});
