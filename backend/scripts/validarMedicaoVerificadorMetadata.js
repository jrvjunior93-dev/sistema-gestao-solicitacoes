'use strict';
// Fixtures de metadata fornecida pelo usuario. Sem .env, banco, PM2 ou rede.
const assert = require('node:assert/strict');
const migration = require('../migrations/202610230002_medicao_vinculos_ativos');
const { executar, conferirPlano, MIGRATION, BACKEND } = require('./aplicarMigrationMedicaoReenvioDev');
const indice = (name, campos, unique = true) => ({ name, unique, fields: campos.map(attribute => ({ attribute, length: null })) });
const expressionEvento = "(case when (`medicao_id` is null) then concat(_utf8mb4\\'S\\',`solicitacao_id`) else concat(_utf8mb4\\'M\\',`medicao_id`) end)";
function fixture() {
  const s = { versao: '8.0.40', engine: 'InnoDB', duplicadas: [], eventos: [], sql: [], apply: 0, asserts: 0, logs: [],
    cols: ['solicitacao_id', 'medicao_id', 'contrato_parcela_id', 'devolvido_em'].map(nome => ({ nome })),
    indices: [indice('medicao_parcelas_ativa_unica', ['contrato_parcela_id', 'vinculo_ativo']),
      indice('medicao_parcelas_evento_unico', ['contrato_parcela_id', 'evento_chave']),
      indice('medicao_parcelas_solicitacao', ['solicitacao_id'], false)],
    state: { tableExists: true, pending: [], executed: new Set([MIGRATION]) } };
  s.cols.push({ nome: 'vinculo_ativo', tipo: 'tinyint', anulavel: 'YES', extra: 'VIRTUAL GENERATED', tamanho: null,
    expressao: '(case when (`devolvido_em` is null) then 1 else NULL end)' },
  { nome: 'evento_chave', tipo: 'varchar', anulavel: 'YES', extra: 'VIRTUAL GENERATED', tamanho: 64, expressao: expressionEvento });
  const runtimeEnv = { ALLOW_SCHEMA_MIGRATIONS: 'false', CONFIRM_DEV_BACKUP: 'NAO' };
  const args = { modo: '--verificar-aplicada', cwd: BACKEND, runtimeEnv, validateRequiredEnv() {}, log: x => s.logs.push(x),
    env: { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' },
    execFileSync(cmd, params) {
      assert.equal(cmd, 'pm2'); assert.deepEqual(params, ['jlist']);
      return JSON.stringify([{ name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: 8001,
        status: 'online', watch: false, ALLOW_SCHEMA_MIGRATIONS: 'false' } }]);
    },
    db: { getQueryInterface: () => ({ showIndex: async () => s.indices }), query: async (sql, options) => {
      s.sql.push(sql); assert(/^SELECT\b/i.test(sql.trim()), 'Nenhuma escrita pode chegar ao banco na retomada');
      if (sql.includes('@@GLOBAL.server_uuid')) return [[{ uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' }]];
      if (sql === 'SELECT VERSION() AS versao') return [[{ versao: s.versao }]];
      if (sql.includes('information_schema.TABLES')) return [[{ engine: s.engine }]];
      if (sql.includes('information_schema.COLUMNS')) {
        assert.deepEqual(options.replacements, ['medicao_parcelas']); return [s.cols];
      }
      if (sql.includes('WHERE devolvido_em IS NULL GROUP')) return [s.duplicadas];
      if (sql.includes('GROUP BY contrato_parcela_id, CASE')) return [s.eventos];
      throw Error('SELECT_NAO_PREVISTO');
    } },
    schema: { getMigrationState: async () => s.state,
      assertMigrationsUpToDate: async () => { s.asserts++; assert.equal(s.state.pending.length, 0); },
      runMigrations: async () => { s.apply++; throw Error('REAPLICACAO_PROIBIDA'); } } };
  return { s, args };
}
async function qa() {
  // Reproduz a falha exata sem modificar a migration ja registrada na EC2.
  let { s, args } = fixture();
  await assert.rejects(migration.up({ sequelize: args.db, queryInterface: args.db.getQueryInterface() }),
    e => e.code === 'MEDICAO_COLUNA_GERADA_DIVERGENTE');
  const original = JSON.stringify(s.cols), flags = { ...args.runtimeEnv };
  await executar(args); await executar(args);
  assert.equal(s.apply, 0); assert.equal(s.asserts, 2);
  assert.equal(JSON.stringify(s.cols), original, 'Nao mutar metadata original');
  assert.deepEqual(args.runtimeEnv, flags, 'Nao habilitar DDL/alterar flags na retomada');
  assert(s.logs.some(x => x.includes('Somente leitura')));
  assert(s.logs.some(x => x.includes('nenhum ALTER')));
  for (const expr of [expressionEvento, expressionEvento.replaceAll("\\'", "'"), migration.COLUNAS.evento_chave.expressao]) {
    const f = fixture(); f.s.cols.at(-1).expressao = expr; await executar(f.args); assert.equal(f.s.apply, 0);
  }
  // Um schema distinto, mesmo semelhante ao metadata observado, continua bloqueado.
  for (const alterar of [s => { s.cols.at(-1).expressao = expressionEvento.replace("S", "X"); },
    s => { s.cols.at(-1).expressao = expressionEvento.replace('`medicao_id`)', '`solicitacao_id`)'); },
    s => { s.cols.at(-1).expressao = expressionEvento.replace('is null', 'is not null'); },
    s => { s.cols.at(-1).expressao = expressionEvento.replaceAll('_utf8mb4', '_binary'); },
    s => { s.cols.at(-1).expressao += ' OR 1'; },
    s => { s.cols.at(-1).tamanho = 63; }, s => { s.cols.at(-1).tipo = 'text'; },
    s => { s.cols.at(-1).extra = 'STORED GENERATED'; }, s => { s.cols.at(-1).anulavel = 'NO'; },
    s => { s.cols.at(-2).expressao = '1'; }, s => { s.cols.at(-2).anulavel = 'NO'; },
    s => { s.indices[0].unique = false; }, s => { s.indices[0].fields.reverse(); },
    s => { s.indices[1].fields[1].length = 10; }, s => { s.indices = []; },
    s => { s.duplicadas = [{}]; }, s => { s.eventos = [{}]; },
    s => { s.versao = '5.7.44'; }, s => { s.engine = 'MyISAM'; },
    s => { s.state.tableExists = false; }, s => { s.state.executed.clear(); },
    s => { s.state.pending = [MIGRATION]; }, s => { s.state.pending = ['outra.js']; },
    // Ate ausencia reparavel de indice/coluna impede retomada: nao executar ALTER.
    s => { s.indices.splice(1, 1); }, s => { s.cols.pop(); s.indices.splice(1, 1); }]) {
    const f = fixture(); alterar(f.s); await assert.rejects(executar(f.args)); assert.equal(f.s.apply, 0);
    assert(f.s.sql.every(sql => /^SELECT\b/i.test(sql.trim())));
    assert.equal(f.args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'false');
  }
  ({ s, args } = fixture()); args.modo = '--verificar'; await executar(args); assert.equal(s.apply, 0);
  // Aplicar apos migration registrada tambem nao repete o DDL (compatibilidade).
  args.modo = '--aplicar'; await executar(args); assert.equal(s.apply, 0);
  await assert.rejects(conferirPlano({}, { up: async ({ sequelize }) => sequelize.query('UPDATE medicao_parcelas SET devolvido_em=NOW()') }), /ESCRITA_BLOQUEADA/);
  console.log('OK metadata MySQL nativo reproduzido: aspas S/M, validador estrito, migration original intacta e retomada somente leitura sem reaplicacao.');
}
if (require.main === module) qa().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { qa };
