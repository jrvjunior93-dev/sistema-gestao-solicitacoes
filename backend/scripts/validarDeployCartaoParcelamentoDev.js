'use strict';
// Testes dos scripts com fixtures, sem .env, banco, rede, PM2 ou deploy reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { aplicar, conferirPendencias, MIGRATION } = require('./aplicarMigrationCartaoParcelamentoDev');
const { conferirAmbiente, BACKEND, HOST, UUID } = require('./verificarPermutasMySqlDev');
const { executar, INDICES, COLUNAS, CONSULTAS } = require('./verificarCartaoParcelamentoMySqlDev');
const indices = esperado => Object.entries(esperado).flatMap(([INDEX_NAME, cols]) => cols.map((COLUMN_NAME, i) =>
  ({ INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX: i + 1, NON_UNIQUE: INDEX_NAME.startsWith('uq_') ? 0 : 1 })));
const env = { deploymentEnvironment: 'development', port: 8001, dbHost: HOST, dbName: 'gestao_solicitacoes', jwtExpiresIn: '12h' };
const processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: BACKEND + '/server.js', PORT: 8001, JWT_EXPIRES_IN: '12h', watch: false } }];
const ambiente = { modo: '--verificar', cwd: BACKEND, env, runtimeEnv: {}, processos };
conferirAmbiente(ambiente);
for (const variante of [{ cwd: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend' },
  { env: { ...env, dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com' } },
  { env: { ...env, deploymentEnvironment: 'production' } }, { env: { ...env, port: 8000 } },
  { processos: [{ ...processos[0], pm2_env: { ...processos[0].pm2_env, watch: true } }] },
  { runtimeEnv: { ALLOW_SCHEMA_MIGRATIONS: 'true' } }]) assert.throws(() => conferirAmbiente({ ...ambiente, ...variante }));
assert.throws(() => conferirPendencias({ tableExists: true, pending: ['outra.js'] }));
assert.throws(() => conferirPendencias({ tableExists: false, pending: [] }));

async function testarMigration() {
  let pending = [MIGRATION], runs = 0;
  const runtimeEnv = {};
  const schema = { getMigrationState: async () => ({ tableExists: true, pending }),
    runMigrations: async opts => { assert.equal(opts.authorized, true); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true'); runs++; pending = []; },
    assertMigrationsUpToDate: async () => assert.equal(pending.length, 0) };
  const dados = { ...ambiente, runtimeEnv, schema, validateRequiredEnv() {},
    db: { query: async () => [[{ uuid: UUID, banco: 'gestao_solicitacoes' }]] },
    execFileSync: () => JSON.stringify(processos), fileSystem: { readFileSync: () => 'JWT_EXPIRES_IN=12h\n' }, log() {} };
  await aplicar(dados); assert.equal(runs, 1); assert(!Object.hasOwn(runtimeEnv, 'ALLOW_SCHEMA_MIGRATIONS'));
  await aplicar(dados); assert.equal(runs, 1);
  pending = ['outra.js']; await assert.rejects(aplicar(dados), /PENDENCIAS/); assert.equal(runs, 1);
  pending = [MIGRATION]; schema.runMigrations = async () => { throw Error('DDL_SIMULADO'); };
  await assert.rejects(aplicar(dados), /DDL_SIMULADO/); assert(!Object.hasOwn(runtimeEnv, 'ALLOW_SCHEMA_MIGRATIONS'));
  await assert.rejects(aplicar({ ...dados, db: { query: async () => [[{ uuid: 'nao-dev' }]] } }), /BANCO_DEV_DIFERENTE/);
}

async function testarLeitura({ erroGrupo = false, erroSql = false, comAmostra = false, uuid = UUID } = {}) {
  const comandos = [];
  const conexao = { query: async (sql, params) => {
    comandos.push(sql);
    if (/server_uuid/.test(sql)) return [[{ uuid, banco: 'gestao_solicitacoes' }]];
    if (/information_schema.columns/.test(sql)) return [params ? COLUNAS.map(COLUMN_NAME => ({ COLUMN_NAME,
      DATA_TYPE: COLUMN_NAME === 'valor' ? 'decimal' : 'int', NUMERIC_PRECISION: 14, NUMERIC_SCALE: 2 })) :
      ['cartao_baixa_chave','cartao_baixa_hash'].map(COLUMN_NAME => ({ COLUMN_NAME, DATA_TYPE: 'varchar', IS_NULLABLE: 'YES' }))];
    if (/information_schema.statistics/.test(sql)) return [indices(params ? INDICES : { uq_mov_cartao_baixa_chave: ['cartao_baixa_chave'] })];
    if (/key_column_usage/.test(sql)) return [[['movimento_financeiro_id','movimentos_financeiros'],
      ['titulo_financeiro_id','titulos_financeiros'],['fatura_cartao_id','financeiro_faturas_cartao'],['criado_por','users']].map(([COLUMN_NAME, REFERENCED_TABLE_NAME]) => ({ COLUMN_NAME, REFERENCED_TABLE_NAME }))];
    if (/EXPLAIN/.test(sql)) { if (erroSql) throw Error('SELECT_SIMULADO'); return [[{ EXPLAIN: JSON.stringify({ query_block: { table: { table_name: 'p', access_type: 'ref' } } }) }]]; }
    if (/HAVING/.test(sql)) return [erroGrupo ? [{ id: 12 }] : []];
    if (/ORDER BY id DESC/.test(sql)) return [comAmostra ? [{ movimento_financeiro_id: 5, fatura_cartao_id: 6, titulo_financeiro_id: 7 }] : []];
    return [[]];
  } };
  if (uuid !== UUID) { await assert.rejects(executar({ conexao, log() {} }), /BANCO_DEV_DIFERENTE/); assert.equal(comandos.length, 1); return; }
  if (erroGrupo || erroSql) await assert.rejects(executar({ conexao, log() {} }));
  else await executar({ conexao, log() {} });
  assert(comandos.includes('START TRANSACTION READ ONLY'));
  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert(comandos.every(s => /^(SELECT|EXPLAIN FORMAT=JSON SELECT|SET SESSION MAX_EXECUTION_TIME|SET TRANSACTION|START TRANSACTION READ ONLY|ROLLBACK)\b/.test(s)));
  if (!erroGrupo) assert.equal(comandos.filter(s => /^EXPLAIN/.test(s)).length, erroSql ? 1 : CONSULTAS.length);
}

(async () => {
  await testarMigration();
  for (const options of [{}, { comAmostra: true }, { erroGrupo: true }, { erroSql: true }, { uuid: 'producao' }]) await testarLeitura(options);
  const shell = fs.readFileSync(path.join(__dirname, '../../ops/deploy/atualizar-dev-cartao-parcelamento-20261019.sh'), 'utf8');
  for (const texto of ['flock -n 9', 'git merge --ff-only', '--backup-dev-conferido', 'git merge-base --is-ancestor HEAD',
    'scripts/aplicarMigrationCartaoParcelamentoDev.js', 'scripts/verificarCartaoParcelamentoMySqlDev.js --verificar',
    'test:cartao-parcelamento-baixa', 'http://127.0.0.1:8001/health']) assert(shell.includes(texto), texto);
  assert(shell.indexOf('conferirAmbiente') < shell.indexOf('git merge --ff-only'));
  assert(shell.indexOf('scripts/aplicarMigrationCartaoParcelamentoDev.js') < shell.indexOf('scripts/verificarCartaoParcelamentoMySqlDev.js'));
  assert(shell.indexOf('scripts/verificarCartaoParcelamentoMySqlDev.js') < shell.indexOf('pm2 restart backend-dev'));
  assert.deepEqual(shell.match(/^pm2\s+.+$/gm), ['pm2 restart backend-dev']);
  assert(!/--update-env|\bssh\b|backend-solicitacoes|sistema-gestao-solicitacoes-main|npm run migrate/.test(shell));
  console.log('Deploy cartao DEV aprovado: identidade/PM2/flags/sessao, allowlist migration e retry, SQL READ ONLY/rollback, EXPLAIN, processo DEV exclusivo. Sem banco/rede/deploy reais.');
})().catch(e => { console.error(e); process.exitCode = 1; });
