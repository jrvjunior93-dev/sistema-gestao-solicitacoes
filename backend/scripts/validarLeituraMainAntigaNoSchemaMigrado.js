'use strict';

// Ensaio de rollback de leitura: modelos originais da main, conexao TLS do staging isolado.
// Nao importa o server.js, nao usa banco de producao e nao executa nenhuma escrita.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Sequelize = require('sequelize');
const { env, validateRequiredEnv } = require('../src/config/env');
const sequelize = require('../src/database');

const MAIN_ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main';
const MAIN_SHA = '250b652032e4dc4bf85845e51d943c47ef7a8768';
const STAGING = Object.freeze({
  host: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
  database: 'fluxy_restore_20261003',
  user: 'fluxy_restore_20261003',
  uuid: '60f043e9-4025-11f1-9a61-06d8a063012d'
});
const MODELS = [
  'Obra', 'Parceiro', 'Solicitacao', 'Contrato',
  'SolicitacaoCompra', 'TituloFinanceiro', 'RhColaborador'
];

async function main() {
  validateRequiredEnv();
  const mainSha = execFileSync('git', ['-C', MAIN_ROOT, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  if (mainSha !== MAIN_SHA || env.dbHost !== STAGING.host ||
      env.dbName !== STAGING.database || env.dbUser !== STAGING.user ||
      !env.dbSslCaFile) {
    throw new Error('Main original ou destino staging nao conferem; ensaio recusado.');
  }

  const [[identity]] = await sequelize.query(
    'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, CURRENT_USER() AS conta'
  );
  const [[ssl]] = await sequelize.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const [[state]] = await sequelize.query('SELECT COUNT(*) AS migrations FROM schema_migrations');
  if (identity.uuid !== STAGING.uuid || identity.banco !== STAGING.database ||
      !String(identity.conta).startsWith(`${STAGING.user}@`) || !ssl?.Value ||
      Number(state.migrations) !== 255) {
    throw new Error('Identidade, TLS ou schema migrado nao conferem; ensaio recusado.');
  }

  for (const name of MODELS) {
    const factory = require(path.join(MAIN_ROOT, 'backend', 'src', 'models', name));
    const model = factory(sequelize, Sequelize);
    const row = await model.findOne({ order: [['id', 'DESC']], raw: true, hooks: false });
    if (!row) throw new Error(`Modelo antigo ${name} nao retornou registro.`);
    console.log(`LEITURA_OK: ${name} (id=${row.id})`);
  }
  console.log('ENSAIO_OK: modelos da main original leram o schema migrado em staging.');
  console.log('Limite: este teste nao garante compatibilidade de todas as rotas nem dos dados criados apos o deploy.');
}

main()
  .catch((error) => {
    console.error('Ensaio de leitura da main antiga reprovado:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
