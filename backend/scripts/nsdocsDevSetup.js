'use strict';
const { check, errorCode } = require('../src/modules/fiscal/services/nsdocs/manual/policy');
const { loadDevCompany, withDevReadDatabase, assertDevProcess } = require('../src/modules/fiscal/services/nsdocs/manual/runtime');
const { createRepository } = require('../src/modules/fiscal/services/nsdocs/manual/repository');
const { storageConfig, createStorage } = require('../src/modules/fiscal/services/nsdocs/manual/storage');
const { fiscalAlignment: alignment, saveSettings } = require('../src/modules/fiscal/services/nsdocs/manual/captureSettings');
const { schemaState, migrateDev } = require('../src/modules/fiscal/services/nsdocs/manual/migrationDev');

async function main(args, dependencies = {}) {
  check(args.length === 1 && ['--conferir', '--configurar-storage', '--preflight-infra', '--migration'].includes(args[0]), 'NSDOCS_ARGUMENTOS_INVALIDOS');
  const company = await (dependencies.company || loadDevCompany)(2, '27123008000100');
  (dependencies.guard || assertDevProcess)();
  const env = dependencies.env || process.env;
  const configured = alignment(env);
  const read = dependencies.readDatabase || withDevReadDatabase;
  const diagnosis = await read(async db => {
    const schema = await (dependencies.schemaState || schemaState)(db);
    let fiscalCompanyId = null;
    try { fiscalCompanyId = await (dependencies.repository || createRepository)(db).fiscalCompany(company); }
    catch (error) { if (error.code !== 'NSDOCS_EMPRESA_FISCAL_DEV_NAO_VINCULADA') throw error; }
    return { ...schema, fiscal_company_id: fiscalCompanyId };
  });
  let result = { outcome: 'NSDOCS_SETUP_DEV_CONFERIDO', company_id: company.id,
    ...configured, ...diagnosis, application_connector_enabled: false, chamadas_nsdocs: 0 };
  if (args[0] !== '--conferir') {
    check(Object.values(configured).every(Boolean), 'NSDOCS_STORAGE_FISCAL_ATUAL_DIVERGENTE_NAO_ALTERADO');
    check(diagnosis.fiscal_company_id, 'NSDOCS_EMPRESA_FISCAL_DEV_NAO_VINCULADA');
    if (args[0] === '--configurar-storage') {
      result = { ...result, outcome: 'NSDOCS_CONFIG_STORAGE_DEV_GUARDADA', created: await (dependencies.save || saveSettings)(),
        configuracao_privada_somente_da_cli: true, env_pm2_intactos: true };
    } else {
      const config = (dependencies.storageConfig || storageConfig)();
      const storage = (dependencies.storage || createStorage)(config);
      try { await storage.preflight(AbortSignal.timeout(60000)); }
      finally { storage.close(); }
      result = { ...result, outcome: 'NSDOCS_INFRA_DEV_CONFERIDA', iam_role: config.roleArn,
        bucket: config.bucket, gravacao_s3_testada: false };
      if (args[0] === '--migration') {
        result = { ...result, ...(await (dependencies.migrate || migrateDev)()), outcome: 'NSDOCS_SCHEMA_CAPTURA_DEV_PRONTO' };
      }
    }
  }
  (dependencies.log || (value => console.log(JSON.stringify(value))))(result);
  return result;
}
module.exports = { alignment, main };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(errorCode(error));
  console.error('Setup DEV interrompido. Nao altere .env/PM2 ou contorne protecoes; envie somente a saida segura.');
  process.exitCode = 1;
});
