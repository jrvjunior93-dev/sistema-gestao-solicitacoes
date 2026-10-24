'use strict';
const fs = require('node:fs');
const { DataTypes } = require('sequelize');
const { executar: conferirDevAnterior, BACKEND } = require('./aplicarMigrationMedicaoReenvioDev');
const MIGRATION = '202610230003_pagamento_envios_retiradas.js';
const TABLE = 'pagamento_envios_retiradas';

// Reutiliza integralmente os guards anteriores (ambiente/UUID/PM2/flags e
// metadata da migration002). Oculta SOMENTE003 da lista de pendencias deles.
async function conferirIdentidade(args) {
  const anterior = { ...args.schema,
    async getMigrationState() {
      const s = await args.schema.getMigrationState();
      return { ...s, pending: s.pending.filter(m => m !== MIGRATION) };
    },
    async assertMigrationsUpToDate() {
      const s = await this.getMigrationState();
      if (!s.tableExists || s.pending.length) throw Error('MIGRATIONS_DEV_ANTERIORES_PENDENTES');
    }
  };
  await conferirDevAnterior({ ...args, modo: '--verificar-aplicada', migration: undefined, schema: anterior, log() {} });
}

async function conferirPlano(db, migration) {
  let criar = 0;
  const qi = db.getQueryInterface();
  await migration.up({ DataTypes, sequelize: {
    query(sql, options) {
      if (!/^SELECT\b/i.test(sql.trim())) throw Error('PREFLIGHT_DEV_ESCRITA_BLOQUEADA');
      return db.query(sql, options);
    }
  }, queryInterface: {
    describeTable: t => qi.describeTable(t), showIndex: t => qi.showIndex(t),
    async createTable(t, cols, options) {
      if (t !== TABLE || Object.keys(cols).sort().join(',') !== 'chave,createdAt,id,pedido_hash,resultado,updatedAt,usuario_id'
        || options?.uniqueKeys?.pagamento_retirada_usuario_chave?.fields.join(',') !== 'usuario_id,chave'
        || cols.usuario_id.references.model !== 'users') throw Error('PLANO_MIGRATION_DEV_DIFERENTE');
      criar++;
    }
  } });
  if (criar > 1) throw Error('PLANO_MIGRATION_DEV_DIFERENTE');
  return criar;
}

async function executar(args) {
  const { modo, db, schema, runtimeEnv = process.env, log = console.log,
    migration = require('../migrations/202610230003_pagamento_envios_retiradas') } = args;
  if (!['--verificar', '--verificar-aplicada', '--aplicar'].includes(modo)) throw Error('MODO_DEV_INVALIDO');
  await conferirIdentidade({ ...args, runtimeEnv });
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(m => m !== MIGRATION)) throw Error('MIGRATIONS_DEV_INESPERADAS');
  if (modo === '--verificar-aplicada' && (state.pending.length || !state.executed.has(MIGRATION))) throw Error('MIGRATION_DEV_NAO_REGISTRADA');
  const plano = await conferirPlano(db, migration);
  if (!state.pending.includes(MIGRATION) && (plano || !state.executed.has(MIGRATION))) throw Error('MIGRATION_DEV_REGISTRADA_SCHEMA_DIVERGENTE');
  log('DEV confirmado: banco/UUID, processo backend-dev/8001, flags e migrations anteriores.');
  log('Pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  log(plano ? 'Plano: criar somente a tabela de recibos de retirada; nenhum registro financeiro sera alterado.' : 'Tabela de recibos conferida; nenhum CREATE necessario.');
  if (modo !== '--aplicar') {
    if (modo === '--verificar-aplicada') await schema.assertMigrationsUpToDate();
    log('Somente leitura; nenhuma migration executada.'); return;
  }
  if (state.pending.includes(MIGRATION)) {
    if (runtimeEnv.CONFIRM_DEV_BACKUP !== 'SIM') throw Error('BACKUP_DEV_NAO_CONFIRMADO');
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try { runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; await schema.runMigrations({ authorized: true }); }
    finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  } else log('Migration003 ja registrada; nenhuma migration repetida.');
  await schema.assertMigrationsUpToDate();
  if (await conferirPlano(db, migration)) throw Error('MIGRATION_DEV_SCHEMA_INCOMPLETO');
  log('Migration003/recibos conferidos. Baixas, titulos e dossies existentes intactos.');
}
if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), runtimeEnv: process.env,
    execFileSync: require('node:child_process').execFileSync })
    .catch(e => {
      const code = String(e.code || e.message || 'FALHA');
      console.error('Atualizacao DEV interrompida: ' + (/^[A-Z0-9_]+$/.test(code) ? code : 'FALHA_SCHEMA_OU_VALIDACAO'));
      process.exitCode = 1;
    }).finally(() => db.close());
}
module.exports = { executar, conferirIdentidade, conferirPlano, MIGRATION, TABLE, BACKEND };
