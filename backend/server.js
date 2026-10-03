const { env, validateRequiredEnv } = require('./src/config/env');
const sequelize = require('./src/database');
const { assertMigrationsUpToDate } = require('./src/database/runMigrations');
const { iniciarOpsSync } = require('./src/services/opsService');
const { loadRuntimeConfig } = require('./src/services/runtimeConfig');
const { ensureRateLimitStoreReady } = require('./src/services/rateLimitStore');
const { iniciarRetencaoEventosSeguranca } = require('./src/services/securityLogService');
const { ensureClamavReady } = require('./src/services/clamavService');
const { iniciarCrmAutomationRuntime } = require('./src/services/crmAutomationRuntimeService');
const { startGovernancaSnapshotJob } = require('./src/modules/governanca/jobs/governancaSnapshotJob');

// Uma rejeição que alcançou o handler global escapou do tratamento normal da
// requisição. O processo pode estar inconsistente; registrar e encerrar deixa
// o PM2 restaurar uma instância limpa. Erros esperados devem ser tratados nos
// controllers/middlewares, sem chegar a este ponto.
process.on('unhandledRejection', (reason) => {
  const erro = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[unhandledRejection]', erro.stack || erro);
  process.exit(1);
});

// Exceção SÍNCRONA não capturada é diferente (decisão do responsável, 02/09):
// depois de um uncaughtException o processo fica em estado indefinido, então
// logar e ENCERRAR — deixando o PM2 subir um processo limpo — é mais seguro
// que mantê-lo de pé.
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error?.stack || error);
  process.exit(1);
});

async function start() {
  validateRequiredEnv();
  await ensureRateLimitStoreReady();
  await ensureClamavReady();
  await assertMigrationsUpToDate();
  await loadRuntimeConfig();

  const app = require('./src/app');
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend rodando na porta ${env.port}`);
    iniciarRetencaoEventosSeguranca();
    iniciarOpsSync(sequelize);
    iniciarCrmAutomationRuntime();
    startGovernancaSnapshotJob();
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(
        `Falha ao iniciar o backend: a porta ${env.port} ja esta em uso. ` +
        'Encerre o processo atual ou altere a variavel PORT antes de subir outra instancia.'
      );
      process.exit(1);
    }

    console.error('Falha ao iniciar o backend', error);
    process.exit(1);
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar o backend', error);
  process.exit(1);
});
