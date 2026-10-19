'use strict';
// Operador em PRODUCAO. Nenhuma conexao/configuracao carregada ao importar.
const { conferirProducao } = require('./promoverSchemaProducao20261018');
const { MIGRATION } = require('./preflightFinanceiroProducao20261019');

async function executar({ modo, schema, runtimeEnv = process.env, log = console.log, ...guardas }) {
  if (!['--verificar', '--aplicar', '--concluido'].includes(modo)) throw Error('Use --verificar, --aplicar ou --concluido.');
  await conferirProducao({ ...guardas, runtimeEnv });
  const estado = await schema.getMigrationState();
  if (!estado.tableExists || estado.pending.some(nome => nome !== MIGRATION)) {
    throw Error('Pendencias fora do pacote: ' + estado.pending.join(', '));
  }
  log('PRODUCAO conferida: identidade, PM2/8000, TLS, JSON, PILOT, sessao 12h e configuracao preservados.');
  log('Migrations pendentes: ' + (estado.pending.join(', ') || 'nenhuma'));
  if (modo === '--concluido' && estado.pending.length) throw Error('Migration de cartao ainda pendente. Nao reinicie.');
  if (modo === '--aplicar' && estado.pending.length) {
    if (runtimeEnv.CONFIRM_PROD_BACKUP !== 'SIM' || runtimeEnv.CONFIRM_PROD_BACKUP_TIMER !== 'SIM') {
      throw Error('Confirme backup cifrado e timer ativo antes de aplicar.');
    }
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  }
  if (modo !== '--verificar' || !estado.pending.length) await schema.assertMigrationsUpToDate();
  log(modo === '--verificar' ? 'Somente leitura. Nenhuma migration/processo/configuracao alterado.'
    : 'Schema conferido. Somente migration 202610190001 autorizada. Sem regularizacao de titulos ou backfill.');
}

if (require.main === module) {
  const fs = require('node:fs');
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, MIGRATION };
