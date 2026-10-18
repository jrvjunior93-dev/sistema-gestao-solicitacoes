'use strict';
// CLI do operador. Importar este modulo nao carrega .env nem abre conexoes.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const MIGRATIONS = Object.freeze([
  '202610180001_rh_inicio_efetivo_obra.js',
  '202610180002_bloqueio_pagamento_proprietario.js'
]);
const IDENTIDADE_SQL = 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco';
const TLS_SQL = "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')";
const JSON_SQL = `SELECT JSON_UNQUOTE(JSON_EXTRACT(JSON_OBJECT('item_id', 7), '$.item_id')) AS item_ok`;
const COLUNAS_SQL = `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, DATA_TYPE AS tipo, IS_NULLABLE AS anulavel
 FROM information_schema.columns WHERE table_schema = DATABASE() AND
 ((table_name = 'rh_colaboradores' AND column_name = 'data_inicio_efetivo_obra') OR
 (table_name = 'titulos_financeiros' AND column_name = 'bloqueio_pagamento_proprietario'))`;
const COLUNAS = [
  ['rh_colaboradores', 'data_inicio_efetivo_obra', 'date'],
  ['titulos_financeiros', 'bloqueio_pagamento_proprietario', 'json']
];
const booleano = value => ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());

async function executar({ modo, cwd, env, validateRequiredEnv, db, schema, execFileSync,
  runtimeEnv = process.env, fileSystem = fs, log = console.log }) {
  if (!['--verificar', '--aplicar', '--concluido'].includes(modo)) throw Error('Use --verificar, --aplicar ou --concluido.');
  validateRequiredEnv();
  if (cwd !== BACKEND || env.deploymentEnvironment !== 'production' || Number(env.port) !== 8000
    || env.dbHost !== 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com'
    || env.dbName !== 'gestao_solicitacoes') throw Error('AMBIENTE_PRODUCAO_DIFERENTE. Pare sem aplicar.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
  const p = processos[0]?.pm2_env;
  if (processos.length !== 1 || p?.pm_exec_path !== `${BACKEND}/server.js`
    || (p.PORT !== undefined && Number(p.PORT) !== 8000)
    || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 PRODUCAO/porta/watch diverge. Pare sem aplicar.');
  const arquivo = dotenv.parse(fileSystem.readFileSync(`${BACKEND}/.env`, 'utf8'));
  // Nao reiniciar com um ambiente de terminal diferente do ambiente persistente.
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE',
    'DEPLOYMENT_ENV', 'PORT', 'JWT_SECRET', 'JWT_EXPIRES_IN']) {
    if ((p[key] !== undefined && String(p[key]) !== String(runtimeEnv[key] ?? ''))
      || (arquivo[key] !== undefined && String(arquivo[key]) !== String(runtimeEnv[key] ?? ''))) {
      throw Error(`Configuracao ${key} divergente; nenhum valor ou segredo exibido. Pare sem aplicar.`);
    }
  }
  for (const [key, valor] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled],
    ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    for (const origem of [p, arquivo]) if (origem[key] !== undefined && booleano(origem[key]) !== valor) throw Error(`Flag ${key} divergente. Nada alterado.`);
    if (p[key] === undefined && arquivo[key] === undefined && valor !== false) throw Error(`Flag ${key} existe somente no terminal. Pare sem aplicar.`);
  }
  for (const origem of [p, arquivo]) {
    if (origem.PAYMENT_OWNER_APPROVAL_MODE !== undefined
      && String(origem.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('PILOT/modo de autorizacao divergente. Nada alterado.');
  }
  if (p.PAYMENT_OWNER_APPROVAL_MODE === undefined && arquivo.PAYMENT_OWNER_APPROVAL_MODE === undefined
    && env.paymentOwnerApprovalMode !== 'OFF') throw Error('Modo de autorizacao existe somente no terminal. Pare sem aplicar.');
  if ([p, arquivo, runtimeEnv].some(origem => booleano(origem.ALLOW_SCHEMA_MIGRATIONS))) throw Error('Remova a autorizacao global/persistida de migrations antes deste roteiro.');
  if (env.jwtExpiresIn !== '12h' || arquivo.JWT_EXPIRES_IN !== '12h'
    || (p.JWT_EXPIRES_IN !== undefined && p.JWT_EXPIRES_IN !== '12h')) throw Error('Sessao produtiva nao confirmada em 12h. Este roteiro nao edita configuracao.');
  if (!env.dbSslCaFile || env.dbSslCaFile !== arquivo.DB_SSL_CA_FILE || !path.posix.isAbsolute(env.dbSslCaFile)
    || !fileSystem.statSync(env.dbSslCaFile).isFile()) throw Error('CA TLS de producao nao conferida. Pare sem aplicar.');
  const [ids] = await db.query(IDENTIDADE_SQL);
  if (ids[0]?.uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53' || ids[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_PRODUCAO_DIFERENTE. Pare sem aplicar.');
  const [tls] = await db.query(TLS_SQL);
  if (!tls.find(row => row.Variable_name === 'Ssl_cipher')?.Value
    || !tls.find(row => row.Variable_name === 'Ssl_version')?.Value) throw Error('Conexao MySQL sem TLS. Pare sem aplicar.');
  const [json] = await db.query(JSON_SQL);
  if (Number(json[0]?.item_ok) !== 7) throw Error('Semantica JSON MySQL divergente. Pare sem aplicar.');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => !MIGRATIONS.includes(nome))) throw Error('Pendencias fora do pacote: ' + state.pending.join(', '));
  const conferirColunas = async (pendentes) => {
    const [rows] = await db.query(COLUNAS_SQL);
    COLUNAS.forEach(([tabela, coluna, tipo], i) => {
      const found = rows.filter(row => row.tabela === tabela && row.coluna === coluna);
      if ((!found.length && !pendentes.includes(MIGRATIONS[i])) || found.length > 1
        || (found.length && (found[0].tipo !== tipo || found[0].anulavel !== 'YES'))) throw Error(`Schema divergente em ${tabela}.${coluna}. Pare e confira.`);
    });
  };
  await conferirColunas(state.pending);
  log('PRODUCAO conferida: caminho, PM2/porta 8000, UUID, TLS, JSON, sessao 12h e flags preservadas.');
  log('Migrations pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--concluido' && state.pending.length) throw Error('Atualizacao ainda tem migrations pendentes. Nao reinicie.');
  if (modo === '--aplicar' && state.pending.length) {
    if (runtimeEnv.CONFIRM_PROD_BACKUP !== 'SIM' || runtimeEnv.CONFIRM_PROD_BACKUP_TIMER !== 'SIM') throw Error('Confirme backup cifrado e timer ativo antes de aplicar.');
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  }
  if (modo !== '--verificar' || !state.pending.length) {
    await schema.assertMigrationsUpToDate();
    await conferirColunas([]);
  }
  log(modo === '--verificar' ? 'Somente leitura. Nenhum registro/configuracao/processo alterado.'
    : 'Schema conferido; somente as duas migrations deste pacote autorizadas. Sem backfill ou alteracao de titulos.');
}
if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, BACKEND, MIGRATIONS, IDENTIDADE_SQL, TLS_SQL, JSON_SQL, COLUNAS_SQL };
