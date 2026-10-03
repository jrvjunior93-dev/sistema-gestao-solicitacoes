'use strict';

// Ensaio limitado a uma restauracao isolada; jamais usar com a conta da aplicacao.
const { env, validateRequiredEnv } = require('../src/config/env');
const sequelize = require('../src/database');
const { getMigrationState, runMigrations } = require('../src/database/runMigrations');

const TARGET = Object.freeze({
  host: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
  database: 'fluxy_restore_20261003',
  user: 'fluxy_restore_20261003',
  uuid: '60f043e9-4025-11f1-9a61-06d8a063012d'
});

function assertConfiguration() {
  validateRequiredEnv();
  if (env.nodeEnv !== 'development' || env.dbHost !== TARGET.host ||
      env.dbName !== TARGET.database || env.dbUser !== TARGET.user ||
      !env.dbSslCaFile || process.env.ALLOW_SCHEMA_MIGRATIONS !== 'true') {
    throw new Error('Ensaio recusado: ambiente, destino, TLS ou autorizacao nao correspondem ao schema temporario.');
  }
}

async function main() {
  assertConfiguration();
  const [rows] = await sequelize.query(
    'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, CURRENT_USER() AS conta'
  );
  const identity = rows[0] || {};
  const [sslRows] = await sequelize.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const sslCipher = sslRows[0]?.Value || '';

  if (identity.uuid !== TARGET.uuid || identity.banco !== TARGET.database ||
      !String(identity.conta).startsWith(`${TARGET.user}@`) || !sslCipher) {
    throw new Error('Ensaio recusado: identidade do RDS, schema, conta ou TLS nao conferem.');
  }

  const before = await getMigrationState();
  const firstApplied = [
    '202608160050_obra_tipo_apropriacao_padrao.js',
    '202608160051_contrato_fluxo_novo.js'
  ];
  const originalSnapshot = before.executed.size === 170 && before.pending.length === 85;
  const partialSnapshot = before.executed.size === 172 && before.pending.length === 83 &&
    firstApplied.every((name) => before.executed.has(name)) &&
    before.pending[0] === '202608160052_contratos_codigo_obra_unico.js';
  if (!before.tableExists || (!originalSnapshot && !partialSnapshot)) {
    throw new Error(
      `Ensaio recusado: estado de migrations inesperado (${before.executed.size} aplicadas, ` +
      `${before.pending.length} pendentes). Esperado snapshot original ou parada conhecida apos as duas primeiras.`
    );
  }

  console.log(`Destino isolado conferido: ${TARGET.database} no RDS staging; ${before.pending.length} migrations pendentes.`);
  await runMigrations({ authorized: true });
  const after = await getMigrationState();
  if (after.pending.length) throw new Error(`${after.pending.length} migrations permanecem pendentes.`);
  console.log(`Ensaio concluido: ${before.pending.length} migrations aplicadas somente no schema temporario.`);
}

main()
  .catch((error) => {
    console.error('Ensaio reprovado:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
