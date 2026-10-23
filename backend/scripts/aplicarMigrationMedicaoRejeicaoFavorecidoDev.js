'use strict';
const path = require('node:path');
const fs = require('node:fs');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const MIGRATION = '202610230001_medicao_rejeicao_favorecido_titulo.js';
const habilitado = value => /^(true|1|yes|on)$/i.test(String(value || '').trim());

// Injetavel para QA sem banco/PM2 real. Nao importar o runtime no require de testes.
async function executar({ modo, cwd, env, validateRequiredEnv, db, schema, execFileSync,
  runtimeEnv = process.env, log = console.log }) {
  if (!['--verificar', '--aplicar'].includes(modo)) throw Error('MODO_DEV_INVALIDO');
  validateRequiredEnv();
  if (cwd !== BACKEND || env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') throw Error('AMBIENTE_DEV_DIFERENTE');
  if (habilitado(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS)) throw Error('DDL_AUTOMATICO_HABILITADO');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const pmEnv = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(pmEnv?.pm_exec_path || '') !== `${BACKEND}/server.js`
    || Number(pmEnv.PORT || env.port) !== 8001 || pmEnv.status !== 'online'
    || (pmEnv.watch && (!Array.isArray(pmEnv.watch) || pmEnv.watch.length))
    || habilitado(pmEnv.ALLOW_SCHEMA_MIGRATIONS)) throw Error('PROCESSO_DEV_DIFERENTE');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`CONFIG_DEV_DIVERGENTE_${key}`);
  }
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (pmEnv[key] !== undefined && habilitado(pmEnv[key]) !== carregado) throw Error(`FLAG_DEV_DIVERGENTE_${key}`);
  }
  if (pmEnv.PAYMENT_OWNER_APPROVAL_MODE !== undefined
    && String(pmEnv.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('FLAG_DEV_DIVERGENTE_OWNER');
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => nome !== MIGRATION)) throw Error('MIGRATIONS_DEV_INESPERADAS: ' + state.pending.join(', '));
  log('DEV conferido: checkout, banco, processo, porta e flags.');
  log('Migrations pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--verificar') { log('Somente leitura. Nenhuma migration aplicada.'); return; }
  if (state.pending.includes(MIGRATION)) {
    if (runtimeEnv.CONFIRM_DEV_BACKUP !== 'SIM') throw Error('BACKUP_DEV_NAO_CONFIRMADO');
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  } else log('Migration ja aplicada; nenhuma repetida.');
  await schema.assertMigrationsUpToDate();
  for (const [tabela, coluna] of [['contrato_medicoes', 'rejeicao'], ['titulos_financeiros', 'pagamento_favorecido']]) {
    const info = (await db.getQueryInterface().describeTable(tabela))[coluna];
    if (!info || String(info.type).toUpperCase() !== 'JSON' || info.allowNull !== true) throw Error('COLUNA_DEV_DIVERGENTE_' + coluna);
  }
  log('Schema DEV atualizado: somente duas colunas JSON opcionais, sem backfill ou alteracao financeira.');
}

if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(error => {
      // Erros de driver podem conter SQL/configuracao; nunca imprimir payload ou segredos.
      const codigo = String(error.code || error.message || 'FALHA').split(':')[0];
      console.error('Migration DEV interrompida: ' + (/^[A-Z0-9_]+$/.test(codigo) ? codigo : 'FALHA_VALIDACAO_OU_BANCO'));
      process.exitCode = 1;
    }).finally(() => db.close());
}
module.exports = { executar, MIGRATION, BACKEND };
