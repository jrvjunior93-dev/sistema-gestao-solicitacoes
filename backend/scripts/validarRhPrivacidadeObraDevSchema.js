'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize'), doctor = require('./rhPrivacidadeObraDevSchema');
const migration = require('../migrations/' + doctor.NAME);
function fixture() {
  const db = new Sequelize('offline', 'offline', 'offline', { dialect: 'mysql', logging: false });
  const ddl = [...doctor.allowedDdl(db)], tx = { connection: { id: 'CANAL_DEV' } }, seen = [];
  const live = { cols: ['rh_colaboradores', 'rh_documentos'].map(TABLE_NAME => ({ TABLE_NAME, COLUMN_NAME: 'id' })),
    indexes: [], applied: false, uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', tls: true, fail: -1, lock: true };
  db.query = async (sql, options) => {
    seen.push(sql); if (options) assert.equal(options.transaction, tx);
    if (sql.includes('@@GLOBAL.server_uuid')) return [[{ uuid: live.uuid, banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW SESSION STATUS')) return [[{ Variable_name: 'Ssl_cipher', Value: live.tls ? 'AES' : '' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
    if (sql.includes('GET_LOCK')) return [[{ acquired: live.lock ? 1 : 0 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql === 'SELECT name FROM schema_migrations ORDER BY name') return [[{ name: 'old.js' }, ...(live.applied ? [{ name: doctor.NAME }] : [])]];
    if (sql.includes('information_schema.COLUMNS')) return [live.cols];
    if (sql.startsWith('SHOW INDEX FROM')) return [live.indexes.filter(r => sql.includes('`' + r.Table + '`'))];
    if (sql.startsWith('INSERT INTO schema_migrations')) { assert.deepEqual(options.replacements, [doctor.NAME]); live.applied = true; return []; }
    const index = ddl.indexOf(sql.trim().replace(/;$/, ''));
    if (index >= 0) {
      if (live.fail === index) throw Error('QA_DDL_INTERROMPIDO');
      if (index < 3) {
        const [TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, nullable, COLUMN_DEFAULT] = doctor.COLUMNS[index];
        live.cols.push({ TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE: nullable ? 'YES' : 'NO', COLUMN_DEFAULT });
      } else {
        const [Table, Key_name, fields, unique] = doctor.INDEXES[index - 3];
        live.indexes.push(...fields.map((Column_name, i) => ({ Table, Key_name, Column_name, Non_unique: unique ? 0 : 1, Seq_in_index: i + 1, Sub_part: null, Visible: 'YES' })));
      }
      return [];
    }
    throw Error('QA_SQL_NAO_ESPERADO');
  };
  // A migration real decide o que falta; DDL passa pelo Sequelize MySQL real.
  const qi = db.getQueryInterface();
  qi.describeTable = async table => Object.fromEntries(live.cols.filter(c => c.TABLE_NAME === table).map(c => [c.COLUMN_NAME, c]));
  qi.showIndex = async table => live.indexes.filter(r => r.Table === table).map(r => ({ name: r.Key_name }));
  return { db, live, ddl, tx, seen, run: () => doctor.apply(db, { transaction: tx, files: ['old.js', doctor.NAME] }) };
}
test('DDL fechado coincide com as3 colunas e2 indices gerados pelo Sequelize MySQL real', async () => {
  const f = fixture(), sql = [];
  f.db.query = async q => { sql.push(q.trim().replace(/;$/, '')); return []; };
  await migration.up({ queryInterface: f.db.getQueryInterface(), DataTypes });
  assert.deepEqual(sql, f.ddl); assert.equal(sql.length, 5);
});
test('migration real e canal dedicado: aplicar e repetir sem duplicar DDL ou ledger', async () => {
  const f = fixture(); assert((await f.run()).applied_now); assert(!(await f.run()).applied_now);
  for (const sql of f.ddl) assert.equal(f.seen.filter(s => s.trim().replace(/;$/, '') === sql).length, 1);
  assert.equal(f.seen.filter(s => s.startsWith('INSERT INTO schema_migrations')).length, 1);
  assert(!f.seen.some(s => /^(UPDATE|DELETE|DROP|TRUNCATE|REPLACE)/.test(s)));
});
test('interrupcao em qualquer DDL permite retomada aditiva sem remover colunas', async () => {
  for (let i = 0; i < 5; i++) {
    const f = fixture(); f.live.fail = i; await assert.rejects(f.run(), /QA_DDL/); assert(!f.live.applied);
    f.live.fail = -1; assert((await f.run()).structure_ok);
    for (let j = 0; j < i; j++) assert.equal(f.seen.filter(s => s.trim().replace(/;$/, '') === f.ddl[j]).length, 1);
  }
});
test('UUID/TLS/lock/canal errado ou migration alheia impedem DDL', async () => {
  for (const [key, value] of [['uuid', 'PRODUCAO'], ['tls', false], ['lock', false]]) {
    const f = fixture(); f.live[key] = value; await assert.rejects(f.run()); assert(!f.seen.some(s => f.ddl.includes(s)));
  }
  const f = fixture(); await assert.rejects(doctor.apply(f.db), /CANAL/);
  await assert.rejects(doctor.state(f.db.query, { files: ['old.js', doctor.NAME, 'outra.js'] }), /OUTRAS_MIGRATIONS/);
});
test('tipos/default/indice incompatíveis e ledger sem estrutura sao recusados', async () => {
  const base = fixture(); await base.run();
  for (const mutate of [s => s.cols[2].COLUMN_TYPE = 'varchar(1)', s => s.cols[2].COLUMN_DEFAULT = '1',
    s => s.cols[2].IS_NULLABLE = 'YES', s => s.indexes[0].Column_name = 'outro',
    s => s.indexes[0].Sub_part = 1, s => s.indexes[0].Visible = 'NO', s => s.indexes[3].Non_unique = 1]) {
    const f = fixture(); Object.assign(f.live, structuredClone(base.live)); mutate(f.live);
    await assert.rejects(f.run(), /INCOMPATIVEL/);
  }
  const f = fixture(); f.live.applied = true; await assert.rejects(f.run(), /LEDGER_SCHEMA/);
});
test('guard rejeita todo DML de negocio e DDL fora do inventario, inclusive remocoes', () => {
  const f = fixture(), set = new Set(f.ddl); for (const s of set) { doctor.structuralSql(s, set); assert.throws(() => doctor.structuralSql(s)); }
  for (const sql of ['DELETE FROM titulos_financeiros', 'UPDATE rh_colaboradores SET salario_base=0',
    'INSERT INTO rh_documentos VALUES (1)', 'ALTER TABLE rh_documentos DROP arquivo_url',
    'SELECT 1; SELECT 2', "SELECT 1 INTO OUTFILE 'x'", 'SELECT SLEEP(2)', f.ddl[0].replace('DEFAULT false', 'DEFAULT true') + ' ' + 'DROP TABLE x'])
    assert.throws(() => doctor.structuralSql(sql, set));
});
test('CLI exige DEV/backup/confirmacao, usa TLS e nunca importa modelos/runner geral', () => {
  const src = fs.readFileSync(path.join(__dirname, 'rhPrivacidadeObraDevSchema.js'), 'utf8');
  assert(src.indexOf("require('dotenv').config") < src.indexOf('runtime.assertDevProcess()'));
  for (const s of ['CONFIRM_RH_PRIVACIDADE_DEV_SCHEMA', 'withDevReadDatabase', 'getRdsSsl', 'refactor/frontend']) assert(src.includes(s));
  assert(!src.includes("require('../src/models')")); assert(!src.includes('migrations:run'));
});
