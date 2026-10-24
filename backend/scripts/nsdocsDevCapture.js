'use strict';
const { parseArgs } = require('node:util');
const { check, companyCnpj, validateQuery, errorCode } = require('../src/modules/fiscal/services/nsdocs/manual/policy');
const { loadDevCompany, withDevReadDatabase } = require('../src/modules/fiscal/services/nsdocs/manual/runtime');
const { preflightCapture, captureManually, UUID } = require('../src/modules/fiscal/services/nsdocs/manual/capture');
const { createRepository } = require('../src/modules/fiscal/services/nsdocs/manual/repository');

function parseOptions(args) {
  let v;
  try { v = parseArgs({ args, strict: true, allowPositionals: false, options: {
    preflight: { type: 'boolean' }, capturar: { type: 'boolean' }, historico: { type: 'boolean' },
    'empresa-id': { type: 'string' }, cnpj: { type: 'string' }, 'captura-id': { type: 'string' },
    inicio: { type: 'string' }, fim: { type: 'string' }, status: { type: 'string' }, quantidade: { type: 'string' },
    deslocamento: { type: 'string' }, 'confirmar-chamada-real': { type: 'boolean' }, 'confirmar-persistencia': { type: 'boolean' }
  } }).values; } catch { check(false, 'NSDOCS_ARGUMENTOS_INVALIDOS'); }
  check(['preflight', 'capturar', 'historico'].filter(k => v[k]).length === 1, 'NSDOCS_ESCOLHA_UMA_OPERACAO');
  check(/^\d{1,9}$/.test(v['empresa-id'] || '') && Number(v['empresa-id']) > 0, 'NSDOCS_EMPRESA_ID_INVALIDO');
  const result = { action: v.capturar ? 'capturar' : v.preflight ? 'preflight' : 'historico',
    companyId: Number(v['empresa-id']), cnpj: companyCnpj(v.cnpj), captureId: v['captura-id'] };
  if (result.action !== 'preflight') check(UUID.test(result.captureId || ''), 'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  const filters = ['inicio', 'fim', 'status', 'quantidade', 'deslocamento', 'confirmar-chamada-real', 'confirmar-persistencia'];
  if (result.action !== 'capturar') {
    check(!filters.some(k => v[k] !== undefined) && (!v.preflight || v['captura-id'] === undefined), 'NSDOCS_ARGUMENTOS_INVALIDOS');
    return result;
  }
  check(v['confirmar-chamada-real'] === true && v['confirmar-persistencia'] === true, 'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  for (const k of ['quantidade', 'deslocamento']) check(v[k] === undefined || /^\d{1,4}$/.test(v[k]), 'NSDOCS_PAGINACAO_INVALIDA');
  result.input = { companyCnpj: result.cnpj, status: v.status, startDate: v.inicio, endDate: v.fim,
    limit: v.quantidade === undefined ? 5 : Number(v.quantidade), offset: v.deslocamento === undefined ? 0 : Number(v.deslocamento) };
  validateQuery(result.input, { companyCnpj: result.cnpj });
  check(result.input.limit <= 5, 'NSDOCS_CAPTURA_MAXIMO_5');
  return result;
}
async function main(args, dependencies = {}) {
  const options = parseOptions(args);
  const company = await (dependencies.loadCompany || loadDevCompany)(options.companyId, options.cnpj);
  const log = dependencies.log || (data => console.log(JSON.stringify(data)));
  if (options.action === 'historico') {
    const result = await (dependencies.readDatabase || withDevReadDatabase)(async db => {
      const repo = (dependencies.repository || createRepository)(db);
      await repo.preflight(company);
      return repo.history(options.captureId, company);
    });
    log({ outcome: 'NSDOCS_CAPTURA_HISTORICO_DEV', ...result, external_nsdocs_calls: 0 });
  } else {
    const operation = options.action === 'preflight' ? (dependencies.preflight || preflightCapture) : (dependencies.capture || captureManually);
    log(await operation({ company, input: options.input, captureId: options.captureId, confirmed: true, signal: dependencies.signal }));
  }
}
module.exports = { parseOptions, main };
if (require.main === module) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  main(process.argv.slice(2), { signal: controller.signal }).catch(error => {
    console.error(errorCode(error));
    console.error('Captura interrompida. Preserve o captura-id para retomar; nao compartilhe chave ou XMLs reais.');
    process.exitCode = 1;
  }).finally(() => { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); });
}
