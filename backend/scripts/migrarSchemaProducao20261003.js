'use strict';

// Runner one-shot da promocao. Nunca e chamado pelo server.js nem pelo deploy automatico.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');

const TARGET = Object.freeze({
  host: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
  database: 'gestao_solicitacoes',
  user: 'admin',
  account: 'admin@%',
  uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53'
});
const MAIN_ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main';
const MAIN_SHA = '250b652032e4dc4bf85845e51d943c47ef7a8768';
const MODES = new Set([
  '--preflight-producao',
  '--executar-85-migrations-producao',
  '--preflight-retomada-28',
  '--retomar-28-migrations-producao'
]);

function isResumeMode(mode) {
  return mode === '--preflight-retomada-28' || mode === '--retomar-28-migrations-producao';
}

function isExecutionMode(mode) {
  return mode === '--executar-85-migrations-producao' || mode === '--retomar-28-migrations-producao';
}

function configure() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !MODES.has(mode)) {
    throw new Error('Informe um modo de preflight ou execucao inicial/retomada explicitamente.');
  }

  const password = process.env.PROD_MIGRATION_ADMIN_PASSWORD;
  const caFile = process.env.PROD_MIGRATION_RDS_CA_FILE;
  if (!password || !caFile || !path.isAbsolute(caFile) || !fs.statSync(caFile).isFile()) {
    throw new Error('Senha administrativa ou arquivo CA absoluto ausente.');
  }

  const mainEnvFile = path.join(MAIN_ROOT, 'backend', '.env');
  const productionConfig = dotenv.parse(fs.readFileSync(mainEnvFile));
  if (productionConfig.DB_HOST !== TARGET.host ||
      productionConfig.DB_NAME !== TARGET.database ||
      Number(productionConfig.DB_PORT || 3306) !== 3306) {
    throw new Error('O .env da main nao aponta para o RDS e banco de producao esperados.');
  }

  const mainSha = execFileSync('git', ['-C', MAIN_ROOT, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  if (mainSha !== MAIN_SHA) {
    throw new Error('Checkout main nao esta no SHA antigo preservado; operacao recusada.');
  }

  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_ENV = 'production';
  process.env.DB_HOST = TARGET.host;
  process.env.DB_PORT = '3306';
  process.env.DB_NAME = TARGET.database;
  process.env.DB_USER = TARGET.user;
  process.env.DB_PASSWORD = password;
  process.env.DB_SSL_CA_FILE = caFile;

  if (isExecutionMode(mode)) {
    if (process.env.ALLOW_SCHEMA_MIGRATIONS !== 'true' ||
        !process.env.PROD_MIGRATION_BACKUP_FILE ||
        !process.env.PROD_MIGRATION_SNAPSHOT_ID) {
      throw new Error('Execucao exige ALLOW_SCHEMA_MIGRATIONS=true e referencias de backup/snapshot conferidos.');
    }
  }
  return mode;
}

async function assertPartialRenegotiationState(sequelize) {
  const [[{ trust_creators: trustCreators }]] = await sequelize.query(
    'SELECT @@GLOBAL.log_bin_trust_function_creators AS trust_creators'
  );
  if (Number(trustCreators) !== 1) {
    throw new Error('RDS ainda nao permite criar os triggers; log_bin_trust_function_creators deve ser 1.');
  }

  const [tables] = await sequelize.query(`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('titulo_renegociacoes', 'titulo_renegociacao_alocacoes')
  `);
  const [columns] = await sequelize.query(`
    SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'titulos_financeiros'
       AND COLUMN_NAME IN ('renegociacao_id', 'renegociado_por_id',
                           'juros_renegociacao', 'multa_renegociacao')
  `);
  const [triggers] = await sequelize.query(`
    SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
       AND TRIGGER_NAME IN ('trg_titulo_negociacao_update', 'trg_titulo_negociacao_delete')
  `);
  const hasExactly = (rows, names) => rows.length === names.length &&
    names.every(name => rows.some(row => row.name === name));
  if (!hasExactly(tables, ['titulo_renegociacoes', 'titulo_renegociacao_alocacoes']) ||
      !hasExactly(columns, ['renegociacao_id', 'renegociado_por_id',
                            'juros_renegociacao', 'multa_renegociacao']) ||
      triggers.length !== 0) {
    throw new Error('Objetos parciais da renegociacao divergiram: esperadas 2 tabelas, 4 colunas e 0 triggers.');
  }
}

async function main() {
  const mode = configure();
  // So importar o singleton depois de fixar DB_*, pois env.js tambem le o .env do ensaio.
  const { env } = require('../src/config/env');
  const sequelize = require('../src/database');
  const { getMigrationState, runMigrations } = require('../src/database/runMigrations');
  try {
    if (env.dbHost !== TARGET.host || env.dbName !== TARGET.database ||
        env.dbUser !== TARGET.user || env.dbSslCaFile !== process.env.PROD_MIGRATION_RDS_CA_FILE) {
      throw new Error('Configuracao efetiva do Sequelize divergiu do destino fixado.');
    }

    const [[identity]] = await sequelize.query(
      'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, CURRENT_USER() AS conta'
    );
    const [[ssl]] = await sequelize.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if (identity.uuid !== TARGET.uuid || identity.banco !== TARGET.database ||
        identity.conta !== TARGET.account || !ssl?.Value) {
      throw new Error('UUID, schema, conta administrativa ou TLS nao conferem.');
    }

    const before = await getMigrationState();
    const resume = isResumeMode(mode);
    const expectedExecuted = resume ? 227 : 170;
    const expectedPending = resume ? 28 : 85;
    const expectedFirst = resume
      ? '202609180002_titulos_renegociacao.js'
      : '202608160050_obra_tipo_apropriacao_padrao.js';
    if (!before.tableExists || before.executed.size !== expectedExecuted ||
        before.pending.length !== expectedPending || before.pending[0] !== expectedFirst ||
        before.pending[expectedPending - 1] !== '202610020002_rh_jornada_etapas_pagamento.js') {
      throw new Error(
        `Estado de migrations divergente: ${before.executed.size} aplicadas, ${before.pending.length} pendentes.`
      );
    }

    if (resume) await assertPartialRenegotiationState(sequelize);

    const [duplicates] = await sequelize.query(`
      SELECT obra_id, codigo, COUNT(*) AS total
        FROM contratos
       WHERE codigo IS NOT NULL
       GROUP BY obra_id, codigo
      HAVING COUNT(*) > 1
       LIMIT 1
    `);
    if (duplicates.length) throw new Error('Ainda existem codigos de contrato repetidos por obra.');

    console.log(`PREFLIGHT_OK: RDS ${identity.uuid}; TLS ${ssl.Value}; ${expectedExecuted} aplicadas, ${expectedPending} pendentes; contratos sem codigos duplicados.`);
    if (!isExecutionMode(mode)) return;

    console.log(`Backup informado: ${process.env.PROD_MIGRATION_BACKUP_FILE}`);
    console.log(`Snapshot informado: ${process.env.PROD_MIGRATION_SNAPSHOT_ID}`);
    console.log(`Iniciando ${expectedPending} migrations de schema; cada DDL pode ter commit proprio no MySQL.`);
    await runMigrations({ authorized: true });
    const after = await getMigrationState();
    if (after.executed.size !== 255 || after.pending.length !== 0) {
      throw new Error(`Pos-migration divergente: ${after.executed.size} aplicadas, ${after.pending.length} pendentes.`);
    }
    console.log('MIGRATIONS_CONFIRMADAS: 255 registradas, zero pendentes.');
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error('PARADA: nao repetir uma execucao antes de analisar o estado atual.', error.message);
  process.exitCode = 1;
});
