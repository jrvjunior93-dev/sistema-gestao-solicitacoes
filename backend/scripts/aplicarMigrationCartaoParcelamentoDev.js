'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const { conferirAmbiente } = require('./verificarPermutasMySqlDev');
const { executar: conferirSessao } = require('./configurarSessao12hDev');
const MIGRATION = '202610190001_cartao_parcelamento_baixa.js';

function conferirPendencias(state) {
  if (!state.tableExists || state.pending.some(nome => nome !== MIGRATION)) {
    throw Error('PENDENCIAS_NAO_AUTORIZADAS: ' + state.pending.join(', '));
  }
}

async function aplicar({ db, schema, env, validateRequiredEnv, processos, runtimeEnv = process.env,
  cwd, execFileSync = cp.execFileSync, fileSystem = fs, log = console.log }) {
  conferirAmbiente({ modo: '--verificar', cwd, env, runtimeEnv, processos });
  // Reutiliza tambem as verificacoes de flags PILOT, identidade, sessao e .env.
  await conferirSessao({ modo: '--verificar', cwd, env, runtimeEnv, validateRequiredEnv, db,
    execFileSync, fileSystem, log, schema: { assertMigrationsUpToDate: async () => {
      conferirPendencias(await schema.getMigrationState());
    } } });
  conferirPendencias(await schema.getMigrationState());
  if ((await schema.getMigrationState()).pending.includes(MIGRATION)) {
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  } else log('Migration de parcelamento ja aplicada; nao repetida.');
  await schema.assertMigrationsUpToDate();
  log('Somente a migration estrutural ' + MIGRATION + ' autorizada no DEV. Sem backfill/configuracao.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--backup-dev-conferido') throw Error('Confirme o backup DEV com --backup-dev-conferido.');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const cwd = fs.realpathSync(process.cwd());
    const processos = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    conferirAmbiente({ modo: '--verificar', cwd, env, runtimeEnv: process.env, processos });
    const db = require('../src/database');
    try { await aplicar({ db, schema: require('../src/database/runMigrations'), env, validateRequiredEnv, cwd, processos }); }
    finally { await db.close(); }
  })().catch(e => { console.error('Migration DEV interrompida:', e.code || e.message); process.exitCode = 1; });
}
module.exports = { aplicar, conferirPendencias, MIGRATION };
