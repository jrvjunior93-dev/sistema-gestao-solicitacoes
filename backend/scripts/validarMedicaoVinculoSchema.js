'use strict';
// Schema/erros em memoria: nao carrega .env/models/index nem acessa DEV/producao.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const migration = require('../migrations/202610230002_medicao_vinculos_ativos');
const { responderErroRegistroMedicao } = require('../src/services/medicaoRegistroErroService');
const legado = 'medicao_parcelas_unico', ativo = 'medicao_parcelas_ativa_unica', evento = 'medicao_parcelas_evento_unico';
const indice = (name, campos, unique = true) => ({ name, unique, fields: campos.map(attribute => ({ attribute })) });
const baseCols = ['solicitacao_id', 'contrato_parcela_id', 'medicao_id', 'devolvido_em'].map(nome => ({ nome, tipo: 'int', extra: '' }));
function fixture() {
  const s = { versao: '8.0.40', engine: 'InnoDB', cols: baseCols.map(c => ({ ...c })),
    indices: [indice(legado, ['solicitacao_id', 'contrato_parcela_id']), indice('medicao_parcelas_parcela', ['contrato_parcela_id'], false)],
    duplicadas: [], eventos: [], ddls: [], falharDDL: false, executarDDL: null, executarSelect: null };
  const args = { queryInterface: { showIndex: async t => { assert.equal(t, 'medicao_parcelas'); return s.indices; } },
    sequelize: { query: async sql => {
      assert(!/\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|TRUNCATE|DROP TABLE)\b/i.test(sql), 'Migration nao pode alterar dados');
      if (sql === 'SELECT VERSION() AS versao') return [[{ versao: s.versao }]];
      if (sql.includes('information_schema.TABLES')) return [[{ engine: s.engine }]];
      if (sql.includes('information_schema.COLUMNS')) return [s.cols];
      if (sql.includes('WHERE devolvido_em IS NULL GROUP')) return [s.executarSelect ? s.executarSelect(sql) : s.duplicadas];
      if (sql.includes('GROUP BY contrato_parcela_id, CASE')) return [s.executarSelect ? s.executarSelect(sql) : s.eventos];
      assert(sql.startsWith('ALTER TABLE medicao_parcelas '), sql);
      assert(sql.endsWith(', ALGORITHM=COPY')); s.ddls.push(sql);
      if (s.falharDDL) throw Error('FALHA_DDL');
      s.executarDDL?.(sql);
      for (const [nome, def] of Object.entries(migration.COLUNAS)) if (!s.cols.some(c => c.nome === nome)) s.cols.push({ nome, tipo: def.tipo,
        extra: 'VIRTUAL GENERATED', expressao: def.expressao, tamanho: nome === 'evento_chave' ? 64 : null, anulavel: 'YES' });
      s.indices = s.indices.filter(i => i.name !== legado);
      for (const i of [indice(ativo, ['contrato_parcela_id', 'vinculo_ativo']), indice(evento, ['contrato_parcela_id', 'evento_chave']), indice('medicao_parcelas_solicitacao', ['solicitacao_id'], false)]) {
        if (!s.indices.some(e => e.name === i.name)) s.indices.push(i);
      }
      return [];
    } } };
  return { s, args };
}
function partesDDL(sql) {
  const partes = []; let inicio = 0, nivel = 0, aspas = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (aspas) { if (c === aspas) aspas = ''; }
    else if (c === "'" || c === '`') aspas = c;
    else if (c === '(') nivel++; else if (c === ')') nivel--;
    else if (c === ',' && nivel === 0) { partes.push(sql.slice(inicio, i).trim()); inicio = i + 1; }
  }
  partes.push(sql.slice(inicio).trim()); return partes;
}
function adaptarDDL(db, sql) {
  // Apenas o envelope ALTER/INDEX muda. Expressoes geradas, colunas e chaves
  // sao os MESMOS produzidos pela migration real para o MySQL.
  const acoes = partesDDL(sql.replace(/^ALTER TABLE medicao_parcelas /, '').replace(/, ALGORITHM=COPY$/, ''));
  db.exec('BEGIN');
  try {
    for (const acao of acoes) {
      let m;
      if (acao.startsWith('ADD COLUMN ')) db.exec('ALTER TABLE medicao_parcelas ' + acao);
      else if ((m = acao.match(/^ADD (UNIQUE )?INDEX (\w+) (\(.+\))$/))) db.exec(`CREATE ${m[1] || ''}INDEX ${m[2]} ON medicao_parcelas ${m[3]}`);
      else if (/^DROP INDEX \w+$/.test(acao)) db.exec(acao);
      else throw Error('DDL nao previsto: ' + acao);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
async function testarSQL() {
  if (process.argv.includes('--sem-sqlite')) { console.log('SQL real nao executado: modo --sem-sqlite explicito.'); return; }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:'); db.function('CONCAT', { deterministic: true, varargs: true }, (...v) => v.join(''));
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE solicitacoes (id INTEGER PRIMARY KEY);
      CREATE TABLE contrato_parcelas (id INTEGER PRIMARY KEY);
      INSERT INTO solicitacoes VALUES (42),(43); INSERT INTO contrato_parcelas VALUES (1),(2),(3);
      CREATE TABLE medicao_parcelas (id INTEGER PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id) ON UPDATE CASCADE ON DELETE CASCADE,
        contrato_parcela_id INTEGER NOT NULL REFERENCES contrato_parcelas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        medicao_id INTEGER, devolvido_em TEXT, valor_medido NUMERIC NOT NULL);
      CREATE UNIQUE INDEX medicao_parcelas_unico ON medicao_parcelas(solicitacao_id,contrato_parcela_id);
      CREATE INDEX medicao_parcelas_parcela ON medicao_parcelas(contrato_parcela_id);`);
    const inserir = db.prepare('INSERT INTO medicao_parcelas(solicitacao_id,contrato_parcela_id,medicao_id,devolvido_em,valor_medido) VALUES (?,?,?,?,?)');
    inserir.run(42, 1, 9, '2026-10-23', 7837.88);
    inserir.run(42, 2, null, '2026-10-23', 100);
    inserir.run(42, 3, 20, null, 200);
    const linhas = () => db.prepare('SELECT id,solicitacao_id,contrato_parcela_id,medicao_id,devolvido_em,valor_medido FROM medicao_parcelas ORDER BY id').all();
    const antes = linhas();
    assert.throws(() => inserir.run(42, 1, 10, null, 7837.88), /UNIQUE/, 'Reproducao do erro antigo');
    const { s, args } = fixture(); s.executarDDL = sql => adaptarDDL(db, sql); s.executarSelect = sql => db.prepare(sql).all();
    await migration.up(args); await migration.up(args); assert.equal(s.ddls.length, 1);
    assert.deepEqual(linhas(), antes, 'DDL nao altera historico, valores, IDs ou status');
    // Parcela rejeitada aceita novo evento, preservando todos os anteriores.
    inserir.run(42, 1, 10, null, 7837.88);
    assert.throws(() => inserir.run(42, 1, 11, null, 1), /UNIQUE/, 'Duas ativas na mesma solicitacao bloqueadas');
    assert.throws(() => inserir.run(43, 1, 11, null, 1), /UNIQUE/, 'Duas ativas entre solicitacoes bloqueadas');
    assert.throws(() => inserir.run(43, 1, 9, '2026-10-24', 1), /UNIQUE/, 'Nao repetir parcela no mesmo evento, mesmo devolvida');
    db.exec("UPDATE medicao_parcelas SET devolvido_em='2026-10-24' WHERE medicao_id=10");
    inserir.run(42, 1, 11, null, 100);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM medicao_parcelas WHERE contrato_parcela_id=1').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM medicao_parcelas WHERE contrato_parcela_id=1 AND devolvido_em IS NULL').get().n, 1);
    assert.throws(() => inserir.run(42, 2, null, null, 100), /UNIQUE/, 'Identidade legada solicitacao/parcela preservada');
    inserir.run(43, 2, null, null, 100);
    assert.throws(() => db.exec('DELETE FROM contrato_parcelas WHERE id=1'), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const indices = db.prepare('PRAGMA index_list(medicao_parcelas)').all();
    assert(!indices.some(i => i.name === legado)); assert(indices.some(i => i.name === ativo && i.unique)); assert(indices.some(i => i.name === evento && i.unique));
    // Reativar historico devolvido tambem nao pode criar duas ativas.
    assert.throws(() => db.exec('UPDATE medicao_parcelas SET devolvido_em=NULL WHERE medicao_id=9'), /UNIQUE/);
    // Insercao sem passar pela guarda do servico tambem encontra o UNIQUE
    // global. Concorrencia sob lock do servico tem QA separado.
    assert.throws(() => inserir.run(43, 3, 21, null, 200), /UNIQUE/);
    // Corrida entre o preflight e o ALTER: a criacao do UNIQUE recusa o
    // conflito. Nem o DROP nem as colunas novas podem ficar pela metade.
    const corrida = new DatabaseSync(':memory:');
    corrida.function('CONCAT', { deterministic: true, varargs: true }, (...v) => v.join(''));
    try {
      corrida.exec(`CREATE TABLE medicao_parcelas (id INTEGER PRIMARY KEY, solicitacao_id INTEGER, contrato_parcela_id INTEGER, medicao_id INTEGER, devolvido_em TEXT);
        CREATE UNIQUE INDEX medicao_parcelas_unico ON medicao_parcelas(solicitacao_id,contrato_parcela_id);
        CREATE INDEX medicao_parcelas_parcela ON medicao_parcelas(contrato_parcela_id);
        INSERT INTO medicao_parcelas VALUES (1,42,1,9,NULL);`);
      const f = fixture(); f.s.executarSelect = sql => corrida.prepare(sql).all(); f.s.executarDDL = sql => {
        corrida.exec('INSERT INTO medicao_parcelas VALUES (2,43,1,10,NULL)');
        adaptarDDL(corrida, sql);
      };
      await assert.rejects(migration.up(f.args), /UNIQUE/);
      assert(corrida.prepare('PRAGMA index_list(medicao_parcelas)').all().some(i => i.name === legado));
      assert(!corrida.prepare('PRAGMA table_xinfo(medicao_parcelas)').all().some(c => c.name === 'vinculo_ativo'));
      assert.equal(corrida.prepare('SELECT COUNT(*) n FROM medicao_parcelas').get().n, 2);
      const preflight = fixture(); preflight.s.executarSelect = sql => corrida.prepare(sql).all();
      await assert.rejects(migration.up(preflight.args), e => e.code === 'MEDICAO_VINCULOS_ATIVOS_DUPLICADOS');
      assert.equal(preflight.s.ddls.length, 0);
    } finally { corrida.close(); }
    console.log('OK SQL SQLite real em memoria: erro antigo reproduzido; DDL real adaptado/idempotente; historico/FKs/legado, reenvios repetidos, uma ativa global e evento unico.');
  } finally { db.close(); }
}
function testarErros() {
  const segredo = 'PIX_PRIVADO_SQL_TOKEN', registros = [];
  const executar = erro => { let status, payload; const res = { status(s) { status = s; return this; }, json(p) { payload = p; return this; } };
    responderErroRegistroMedicao(res, erro, { usuarioId: 9, contratoId: 11, solicitacaoId: 42 }, (...x) => registros.push(x));
    assert(!JSON.stringify([payload, registros]).includes(segredo)); return { status, payload }; };
  for (const nome of [legado, ativo, evento]) {
    const r = executar({ name: 'SequelizeUniqueConstraintError', message: 'Validation error', parent: { code: 'ER_DUP_ENTRY', sqlMessage: `Duplicate entry '${segredo}' for key '${nome}'` }, fields: { cpf_cnpj: segredo } });
    assert.equal(r.status, 409); assert(!r.payload.error.includes('Validation error'));
    assert.equal(registros.at(-1)[1].indice, nome);
  }
  assert.equal(executar({ statusCode: 403, message: 'Sem permissao para medir.' }).status, 403);
  assert.equal(executar({ name: 'SequelizeValidationError', message: segredo }).status, 400);
  assert.equal(executar({ message: 'SELECT ' + segredo, parent: { sql: segredo } }).status, 500);
  const fonte = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
  const inicio = fonte.indexOf('const registro = await registrarMedicaoDoContrato('), fim = fonte.indexOf("if (campoObrigatorio('itens_apropriacao')", inicio);
  assert(inicio > 0 && fim > inicio); assert(fonte.slice(inicio, fim).includes('responderErroRegistroMedicao'));
}
async function testarRunnerSchemaOnly() {
  const nome = '202610230002_medicao_vinculos_ativos.js', f = fixture(), executadas = new Set();
  const sqlMigration = fs.readFileSync(path.resolve(__dirname, '../migrations', nome), 'utf8');
  const qi = { ...f.args.queryInterface, addColumn: async () => { throw Error('Nao esperado no ALTER unico'); } };
  const db = { getQueryInterface: () => qi, escape: v => `'${v}'`, query: async sql => {
    if (/SELECT 1\s+FROM information_schema\.tables/i.test(sql)) return [[{ existe: 1 }]];
    if (sql.startsWith('SELECT name FROM schema_migrations')) return [[...executadas].map(name => ({ name }))];
    if (sql.startsWith('INSERT INTO schema_migrations')) { assert(sql.includes(nome)); executadas.add(nome); return []; }
    return f.args.sequelize.query(sql);
  } };
  const mod = { exports: {} };
  const req = id => {
    if (id === 'fs') return { existsSync: () => true, readdirSync: () => [nome], readFileSync: () => sqlMigration };
    if (id === 'path') return path;
    if (id === 'sequelize') return { Sequelize: { DataTypes: {} } };
    if (id === '../config/env') return { validateRequiredEnv() {} };
    if (id === './index') return db;
    assert.equal(path.basename(id), nome); return migration;
  };
  req.resolve = x => x; req.cache = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/database/runMigrations.js'), 'utf8'), {
    require: req, module: mod, __dirname: path.resolve(__dirname, '../src/database'),
    process: { env: { ALLOW_SCHEMA_MIGRATIONS: 'true' } }, console: { log() {} }
  });
  mod.exports.assertMigrationSourceIsSchemaOnly(nome, sqlMigration);
  await assert.rejects(mod.exports.runMigrations({ authorized: false }), e => e.code === 'SCHEMA_MIGRATIONS_NOT_AUTHORIZED');
  await mod.exports.runMigrations({ authorized: true }); await mod.exports.runMigrations({ authorized: true });
  await mod.exports.assertMigrationsUpToDate(); assert.equal(f.s.ddls.length, 1); assert(executadas.has(nome));
}
async function qa() {
  let { s, args } = fixture(); await migration.up(args); await migration.up(args);
  assert.equal(s.ddls.length, 1); assert(s.ddls[0].includes('ADD INDEX medicao_parcelas_solicitacao (solicitacao_id)'));
  assert(s.ddls[0].includes('DROP INDEX medicao_parcelas_unico'));
  for (const c of s.cols.filter(c => c.expressao)) c.expressao = '(' + c.expressao
    .replace(/'([SM])'/g, "_utf8mb4'$1'").replace(/\b(medicao_id|solicitacao_id|devolvido_em)\b/g, '`$1`') + ')';
  await migration.up(args); assert.equal(s.ddls.length, 1, 'Normalizacao do metadata MySQL nao repete DDL');
  s.cols.find(c => c.nome === 'vinculo_ativo').anulavel = 'NO';
  await assert.rejects(migration.up(args), e => e.code === 'MEDICAO_COLUNA_GERADA_DIVERGENTE');
  for (const alterar of [s => { s.versao = '5.7.44'; }, s => { s.versao = '10.11-MariaDB'; }, s => { s.engine = 'MyISAM'; },
    s => { s.cols = []; }, s => { s.indices[0].unique = false; }, s => { s.indices[0].fields.reverse(); },
    s => { s.indices = []; }, s => { s.duplicadas = [{ contrato_parcela_id: 1 }]; }, s => { s.eventos = [{}]; },
    s => { s.cols.push({ nome: 'vinculo_ativo', tipo: 'tinyint', extra: '', expressao: '1' }); },
    s => { s.indices.push(indice(ativo, ['contrato_parcela_id', 'vinculo_ativo'])); }]) {
    const f = fixture(); alterar(f.s); await assert.rejects(migration.up(f.args)); assert.equal(f.s.ddls.length, 0);
  }
  ({ s, args } = fixture()); s.falharDDL = true;
  await assert.rejects(migration.up(args), /FALHA_DDL/); assert(s.indices.some(i => i.name === legado)); assert.equal(s.cols.length, 4);
  s.falharDDL = false; await migration.up(args); assert(!s.indices.some(i => i.name === legado));
  // Retomada com colunas/indices ja corretos nunca remove a protecao ativa.
  s.indices = s.indices.filter(i => i.name !== evento); await migration.up(args);
  assert(s.ddls.at(-1).includes('ADD UNIQUE INDEX ' + evento)); assert(!s.ddls.at(-1).includes('DROP INDEX'));
  await assert.rejects(migration.down(), /ROLLBACK/);
  testarErros(); await testarRunnerSchemaOnly(); await testarSQL();
  console.log('OK migration/erros: preflight falha fechado, troca unica/retomada, sem DML/rollback destrutivo, 409 seguro e logs sem PIX/SQL/segredos.');
}
if (require.main === module) qa().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { qa };
