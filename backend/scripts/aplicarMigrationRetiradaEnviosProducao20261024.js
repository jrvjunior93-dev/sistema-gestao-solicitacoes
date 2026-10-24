'use strict';
// Importacao pura. Reusa identidade PROD/TLS/12h/flags e schema001/002 homologado.
const { executar: conferirAnterior, BACKEND } = require('./aplicarMigrationsMedicaoFiltrosProducao20261023');
const { conferirPlano, MIGRATION, TABLE } = require('./aplicarMigrationRetiradaEnviosDev');
async function conferirTabela(db, plano) {
  if (plano) return;
  const cols = await db.getQueryInterface().describeTable(TABLE);
  const expected = { id: /^INT(?:EGER)?(?:\(\d+\))?$/i, usuario_id: /^INT(?:EGER)?(?:\(\d+\))?$/i,
    chave: /^VARCHAR\(64\)$/i, pedido_hash: /^VARCHAR\(64\)$/i, resultado: /^JSON$/i,
    createdAt: /^DATETIME(?:\(\d+\))?$/i, updatedAt: /^DATETIME(?:\(\d+\))?$/i };
  if (Object.entries(expected).some(([k, re]) => !cols[k] || !re.test(String(cols[k].type).trim()) || cols[k].allowNull !== false)
    || cols.id.primaryKey !== true) throw Error('TABELA_RECIBOS_PRODUCAO_INCOMPATIVEL');
}
async function executar(ctx) {
  const { modo, db, schema, runtimeEnv = process.env, log = console.log,
    migration = require('../migrations/202610230003_pagamento_envios_retiradas') } = ctx;
  if (!['--verificar','--aplicar','--concluido'].includes(modo)) throw Error('MODO_PRODUCAO_INVALIDO');
  // Ocultar apenas003 do verificador anterior; nao executar DDL001/002 novamente.
  const anterior = { ...schema, async getMigrationState() {
    const s = await schema.getMigrationState(); return { ...s, pending: s.pending.filter(m => m !== MIGRATION) };
  }, async assertMigrationsUpToDate() {
    const s = await this.getMigrationState(); if (!s.tableExists || s.pending.length) throw Error('SCHEMA_ANTERIOR_PENDENTE');
  } };
  await conferirAnterior({ ...ctx, modo: '--concluido', schema: anterior, runtimeEnv, log() {} });
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(m => m !== MIGRATION)) throw Error('SCHEMA_FORA_DO_PACOTE003');
  const plano = await conferirPlano(db, migration);
  await conferirTabela(db, plano);
  if (!state.pending.includes(MIGRATION) && (plano || !state.executed.has(MIGRATION))) throw Error('MIGRATION003_REGISTRADA_SCHEMA_DIVERGENTE');
  if (modo === '--concluido' && state.pending.length) throw Error('MIGRATION003_AINDA_PENDENTE');
  log('PROD UUID/TLS/JSON/12h/flags/timer e migrations anteriores conferidos. Pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--verificar') { log('Somente leitura. Nenhuma migration aplicada.'); return; }
  if (modo === '--aplicar' && state.pending.length) {
    if (runtimeEnv.CONFIRM_PROD_BACKUP !== 'SIM' || runtimeEnv.CONFIRM_PROD_BACKUP_TIMER !== 'SIM'
      || runtimeEnv.CONFIRM_PROD_MAINTENANCE !== 'SIM') throw Error('BACKUP_TIMER_JANELA_NAO_CONFIRMADOS');
    ctx.execFileSync('systemctl', ['is-active','--quiet','fluxy-prod-db-backup.timer']);
    const old = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try { runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; await schema.runMigrations({ authorized: true }); }
    finally { if (old === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS; else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = old; }
  }
  await schema.assertMigrationsUpToDate();
  const final = await conferirPlano(db, migration); if (final) throw Error('MIGRATION003_SCHEMA_INCOMPLETO');
  await conferirTabela(db, final);
  log('MIGRATION003_PRODUCAO_CONFERIDA. Sem alteracao de titulos, saldos, baixas, comprovantes ou historico anterior.');
}
if (require.main === module) (async () => {
  const fs = require('node:fs'), cp = require('node:child_process');
  const { env, validateRequiredEnv } = require('../src/config/env'), db = require('../src/database');
  try { await executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: cp.execFileSync }); }
  finally { await db.close(); }
})().catch(e => { const c = String(e.original?.code || e.code || e.message || 'FALHA');
  console.error('SCHEMA_PROD_INTERROMPIDO:' + (/^[A-Z0-9_]+$/.test(c) ? c : 'FALHA_VALIDACAO_OU_BANCO')); process.exitCode = 1; });
module.exports = { executar, conferirTabela, MIGRATION, TABLE, BACKEND };
