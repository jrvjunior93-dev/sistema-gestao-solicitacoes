'use strict';

const { validateRequiredEnv } = require('../src/config/env');
const sequelize = require('../src/database');
const { assertMigrationsUpToDate } = require('../src/database/runMigrations');

async function main() {
  validateRequiredEnv();
  const state = await assertMigrationsUpToDate();
  console.log(`Preflight concluido: ${state.pending.length} migration(s) pendente(s).`);
}

main()
  .catch((error) => {
    console.error('Preflight de schema reprovado:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
