'use strict';
// CLI exclusivo do operador PROD. Importacao pura, sem .env/models/conexoes.
const { conferirProducao, BACKEND } = require('./promoverSchemaProducao20261018');
// Apenas o preflight puro, com a correcao do metadata MySQL homologada no DEV.
const { conferirPlano } = require('./aplicarMigrationMedicaoReenvioDev');
const MIGRATIONS = Object.freeze(['202610230001_medicao_rejeicao_favorecido_titulo.js', '202610230002_medicao_vinculos_ativos.js']);
const COLUNAS = [['contrato_medicoes', 'rejeicao'], ['titulos_financeiros', 'pagamento_favorecido']];
const COLUNAS_SQL = `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, DATA_TYPE AS tipo, IS_NULLABLE AS anulavel
 FROM information_schema.columns WHERE table_schema=DATABASE() AND
 ((table_name='contrato_medicoes' AND column_name='rejeicao') OR
 (table_name='titulos_financeiros' AND column_name='pagamento_favorecido'))`;
async function executar(ctx) {
  const { modo, db, schema, execFileSync, runtimeEnv = process.env, log = console.log } = ctx;
  if (!['--verificar', '--aplicar', '--concluido'].includes(modo)) throw Error('MODO_PRODUCAO_INVALIDO');
  await conferirProducao({ ...ctx, runtimeEnv });
  const ps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
  if (ps.length !== 1 || ps[0].pm2_env?.status !== 'online') throw Error('PROCESSO_PRODUCAO_OFFLINE');
  execFileSync('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => !MIGRATIONS.includes(nome))) throw Error('SCHEMA_FORA_DO_PACOTE');
  if (state.pending.includes(MIGRATIONS[0]) && !state.pending.includes(MIGRATIONS[1])) throw Error('SCHEMA_ORDEM_DIVERGENTE');
  const conferirColunas = async pendentes => {
    const [rows] = await db.query(COLUNAS_SQL);
    for (const [tabela, coluna] of COLUNAS) {
      const encontradas = rows.filter(r => r.tabela === tabela && r.coluna === coluna);
      if ((!encontradas.length && !pendentes.includes(MIGRATIONS[0])) || encontradas.length > 1
        || (encontradas.length && (encontradas[0].tipo !== 'json' || encontradas[0].anulavel !== 'YES'))) throw Error('SCHEMA_JSON_DIVERGENTE');
    }
  };
  await conferirColunas(state.pending);
  const plano = await conferirPlano(db, require('../migrations/202610230002_medicao_vinculos_ativos'));
  if (!state.pending.includes(MIGRATIONS[1]) && plano) throw Error('SCHEMA_REGISTRADO_DIVERGENTE');
  // DDL realizado mas nao registrado exige diagnostico; nao editar a tabela
  // schema_migrations automaticamente nem repetir a migration historica.
  if (state.pending.includes(MIGRATIONS[1]) && !plano) throw Error('SCHEMA_SEM_REGISTRO_CONFERIR');
  log('PRODUCAO conferida: UUID/TLS/JSON/12h/flags/timer, colunas e unicidade. Pendencias: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--concluido' && state.pending.length) throw Error('SCHEMA_AINDA_PENDENTE');
  if (modo === '--verificar' && state.pending.length) { log('Somente leitura. Nenhuma migration aplicada.'); return; }
  if (modo === '--aplicar' && state.pending.length) {
    if (runtimeEnv.CONFIRM_PROD_BACKUP !== 'SIM' || runtimeEnv.CONFIRM_PROD_BACKUP_TIMER !== 'SIM'
      || runtimeEnv.CONFIRM_PROD_MAINTENANCE !== 'SIM') throw Error('BACKUP_TIMER_JANELA_NAO_CONFIRMADOS');
    execFileSync('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  }
  await schema.assertMigrationsUpToDate();
  await conferirColunas([]);
  if (await conferirPlano(db, require('../migrations/202610230002_medicao_vinculos_ativos'))) throw Error('SCHEMA_PRODUCAO_INCOMPLETO');
  log('Schema PROD concluido: JSON opcionais e uma medicao ativa por parcela. Sem backfill, baixa, estorno ou alteracao de saldo.');
}
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3) throw Error('ARGUMENTOS_INVALIDOS');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const db = require('../src/database');
    try { await executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
      schema: require('../src/database/runMigrations'), execFileSync: cp.execFileSync }); }
    finally { await db.close(); }
  })().catch(error => {
    const codigo = String(error.original?.code || error.code || error.message || 'FALHA');
    console.error('SCHEMA PROD INTERROMPIDO:', /^[A-Z0-9_]+$/.test(codigo) ? codigo : 'FALHA_VALIDACAO_OU_BANCO');
    process.exitCode = 1;
  });
}
module.exports = { executar, MIGRATIONS, COLUNAS, COLUNAS_SQL, BACKEND };
