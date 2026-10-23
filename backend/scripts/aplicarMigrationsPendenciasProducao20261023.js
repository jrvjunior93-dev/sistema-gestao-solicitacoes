'use strict';
// CLI do operador. Importacao pura; nao carrega env/models nem abre conexoes.
const { conferirProducao, BACKEND } = require('./promoverSchemaProducao20261018');
const MIGRATIONS = Object.freeze(['202610220001_titulo_negociacao_pagamento.js', '202610220002_baixa_composta_estornos_cheques.js']);
const COLUNAS = [['titulos_financeiros', 'pagamento_negociacao'], ['baixas_financeiras_grupos', 'estornos_cheques']];
const COLUNAS_SQL = `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, DATA_TYPE AS tipo, IS_NULLABLE AS anulavel
 FROM information_schema.columns WHERE table_schema=DATABASE() AND
 ((table_name='titulos_financeiros' AND column_name='pagamento_negociacao') OR
 (table_name='baixas_financeiras_grupos' AND column_name='estornos_cheques'))`;

async function executar(ctx) {
  const { modo, db, schema, execFileSync, runtimeEnv = process.env, log = console.log } = ctx;
  if (!['--verificar', '--aplicar', '--concluido'].includes(modo)) throw Error('Use --verificar, --aplicar ou --concluido.');
  await conferirProducao({ ...ctx, runtimeEnv });
  const ps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
  if (ps.length !== 1 || ps[0].pm2_env?.status !== 'online') throw Error('PROCESSO_PRODUCAO_OFFLINE. Pare sem aplicar.');
  execFileSync('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => !MIGRATIONS.includes(nome))) throw Error('SCHEMA_FORA_DO_PACOTE. Pare e confira as pendencias.');
  const conferirColunas = async pendentes => {
    const [rows] = await db.query(COLUNAS_SQL);
    for (const [indice, [tabela, coluna]] of COLUNAS.entries()) {
      const encontradas = rows.filter(row => row.tabela === tabela && row.coluna === coluna);
      if ((!encontradas.length && !pendentes.includes(MIGRATIONS[indice])) || encontradas.length > 1
        || (encontradas.length && (encontradas[0].tipo !== 'json' || encontradas[0].anulavel !== 'YES'))) {
        throw Error(`SCHEMA_COLUNA_DIVERGENTE: ${tabela}.${coluna}. Pare sem reiniciar.`);
      }
    }
  };
  await conferirColunas(state.pending);
  log('PRODUCAO: identidade/TLS/JSON/sessao/flags/timer conferidos; pendencias: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--concluido' && state.pending.length) throw Error('SCHEMA_AINDA_PENDENTE. Nao reinicie.');
  if (modo === '--verificar' && state.pending.length) return;
  if (modo === '--aplicar' && state.pending.length) {
    if (runtimeEnv.CONFIRM_PROD_BACKUP !== 'SIM' || runtimeEnv.CONFIRM_PROD_BACKUP_TIMER !== 'SIM') throw Error('BACKUP_PRODUCAO_NAO_CONFIRMADO. Pare sem aplicar.');
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
  log('Duas colunas JSON nullable conferidas. Nenhum backfill, baixa, estorno ou saldo alterado por este aplicador.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || !['--verificar', '--aplicar', '--concluido'].includes(process.argv[2])) throw Error('Use --verificar, --aplicar ou --concluido.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const db = require('../src/database');
    try {
      await executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env,
        validateRequiredEnv, db, schema: require('../src/database/runMigrations'), execFileSync: cp.execFileSync });
    } finally { await db.close(); }
  })().catch(error => {
    // Nunca imprimir mensagens arbitrarias do driver, SQL ou dados do .env.
    console.error('ATUALIZACAO SCHEMA PROD INTERROMPIDA. Confira ambiente/schema/conectividade sem compartilhar segredos. Codigo:', error.original?.code || error.code || error.name);
    process.exitCode = 1;
  });
}
module.exports = { executar, MIGRATIONS, COLUNAS, COLUNAS_SQL, BACKEND };
