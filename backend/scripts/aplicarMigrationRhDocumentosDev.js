'use strict';
const path = require('node:path');
const fs = require('node:fs');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const MIGRATION = '202610180001_rh_inicio_efetivo_obra.js';
const IDENTIDADE_SQL = 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco';
const JSON_SQL = `SELECT JSON_CONTAINS(JSON_OBJECT('titulos', JSON_ARRAY(JSON_OBJECT('colaborador_id', 11))), JSON_OBJECT('colaborador_id', 11), '$.titulos') AS referencia_ok`;
const COLUNA_SQL = `SELECT DATA_TYPE AS tipo, IS_NULLABLE AS anulavel FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rh_colaboradores' AND column_name = 'data_inicio_efetivo_obra'`;

async function executar({ modo, cwd, env, validateRequiredEnv, db, schema, execFileSync,
  runtimeEnv = process.env, log = console.log }) {
  if (!['--verificar', '--aplicar'].includes(modo)) throw Error('Use --verificar ou --aplicar exclusivamente no DEV.');
  validateRequiredEnv();
  if (cwd !== BACKEND || env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') throw Error('AMBIENTE_DEV_DIFERENTE. Nenhuma migration aplicada.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const p = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(p?.pm_exec_path || '') !== `${BACKEND}/server.js`
    || Number(p.PORT || env.port) !== 8001) throw Error('PROCESSO_DEV_DIFERENTE. Nenhuma migration aplicada.');
  if (p.watch && (!Array.isArray(p.watch) || p.watch.length)) throw Error('PM2 WATCH ativo no DEV. Pare e confira antes de atualizar arquivos.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (p[key] !== undefined && String(p[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`Variavel ${key} diverge no PM2. Confira sem compartilhar segredos.`);
  }
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (p[key] !== undefined && ['1', 'true', 'yes', 'on'].includes(String(p[key]).trim().toLowerCase()) !== carregado) throw Error(`Flag ${key} divergente. Nenhuma flag alterada.`);
  }
  if (p.PAYMENT_OWNER_APPROVAL_MODE !== undefined && String(p.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('PAYMENT_OWNER_APPROVAL_MODE divergente. Nenhuma flag alterada.');
  if ([p.ALLOW_SCHEMA_MIGRATIONS, runtimeEnv.ALLOW_SCHEMA_MIGRATIONS].some(v => String(v).trim().toLowerCase() === 'true')) throw Error('Nao mantenha ALLOW_SCHEMA_MIGRATIONS habilitado no ambiente/PM2.');
  const [rows] = await db.query(IDENTIDADE_SQL);
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE. Nenhuma migration aplicada.');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => nome !== MIGRATION)) throw Error('Schema DEV tem pendencias fora deste ajuste. Pare e envie a lista: ' + state.pending.join(', '));
  const [json] = await db.query(JSON_SQL);
  if (Number(json[0]?.referencia_ok) !== 1) throw Error('Teste JSON_CONTAINS DEV falhou. Nenhuma migration aplicada.');
  log('DEV conferido: identidade, processo, porta 8001, flags e semantica JSON MySQL.');
  log('Migrations pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--verificar' && state.pending.length) { log('Somente leitura. Nenhuma migration aplicada.'); return; }
  if (modo === '--aplicar' && state.pending.includes(MIGRATION)) {
    if (runtimeEnv.CONFIRM_DEV_BACKUP !== 'SIM') throw Error('Confirme backup DEV com CONFIRM_DEV_BACKUP=SIM. Nenhuma migration aplicada.');
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
  const [colunas] = await db.query(COLUNA_SQL);
  if (colunas.length !== 1 || colunas[0].tipo !== 'date' || colunas[0].anulavel !== 'YES') throw Error('Coluna de inicio efetivo DEV diverge. Pare e confira.');
  log('Schema DEV e coluna informativa conferidos. Somente migration 202610180001 autorizada; sem alterar configuracao, dados cadastrais ou processos.');
}
if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, MIGRATION, BACKEND, IDENTIDADE_SQL, JSON_SQL, COLUNA_SQL };
