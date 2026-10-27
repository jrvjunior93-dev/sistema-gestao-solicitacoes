'use strict';
const { parseArgs } = require('node:util');
const { check, companyCnpj, validKey, validateQuery, assertNoSecret, errorCode } = require('../src/modules/fiscal/services/nsdocs/manual/policy');
const store = require('../src/modules/fiscal/services/nsdocs/manual/privateStore');
const { loadDevCompany, listDevCompanies } = require('../src/modules/fiscal/services/nsdocs/manual/runtime');
const { readHiddenKey } = require('../src/modules/fiscal/services/nsdocs/manual/hiddenPrompt');
const { queryManually } = require('../src/modules/fiscal/services/nsdocs/manual/query');

function parseOptions(args) {
  let values;
  try {
    values = parseArgs({ args, options: {
      configurar: { type: 'boolean' }, conferir: { type: 'boolean' }, consultar: { type: 'boolean' }, 'listar-empresas': { type: 'boolean' },
      'empresa-id': { type: 'string' }, cnpj: { type: 'string' }, inicio: { type: 'string' }, fim: { type: 'string' },
      status: { type: 'string' }, quantidade: { type: 'string' }, deslocamento: { type: 'string' },
      'confirmar-chamada-real': { type: 'boolean' }, 'mostrar-documentos': { type: 'boolean' }
    }, strict: true, allowPositionals: false }).values;
  } catch { check(false, 'NSDOCS_ARGUMENTOS_INVALIDOS'); }
  check(['configurar', 'conferir', 'consultar', 'listar-empresas'].filter(key => values[key]).length === 1, 'NSDOCS_ESCOLHA_UMA_OPERACAO');
  if (values['listar-empresas']) {
    check(Object.keys(values).length === 1, 'NSDOCS_ARGUMENTOS_INVALIDOS');
    return { action: 'listar-empresas' };
  }
  check(/^\d{1,9}$/.test(values['empresa-id'] || '') && Number(values['empresa-id']) > 0, 'NSDOCS_EMPRESA_ID_INVALIDO');
  const companyId = Number(values['empresa-id']), cnpj = companyCnpj(values.cnpj);
  if (!values.consultar) {
    check(!Object.keys(values).some(key => ['inicio', 'fim', 'status', 'quantidade', 'deslocamento',
      'confirmar-chamada-real', 'mostrar-documentos'].includes(key)), 'NSDOCS_ARGUMENTOS_INVALIDOS');
    return { action: values.configurar ? 'configurar' : 'conferir', companyId, cnpj };
  }
  check(values['confirmar-chamada-real'] === true, 'NSDOCS_CONFIRMACAO_REAL_OBRIGATORIA');
  for (const key of ['quantidade', 'deslocamento']) check(values[key] === undefined || /^\d{1,4}$/.test(values[key]), 'NSDOCS_PAGINACAO_INVALIDA');
  const input = { companyCnpj: cnpj, status: values.status, startDate: values.inicio, endDate: values.fim,
    limit: values.quantidade === undefined ? 10 : Number(values.quantidade),
    offset: values.deslocamento === undefined ? 0 : Number(values.deslocamento) };
  validateQuery(input, { companyCnpj: cnpj });
  return { action: 'consultar', companyId, cnpj, input, showDocuments: values['mostrar-documentos'] === true };
}

async function main(args, dependencies = {}) {
  const options = parseOptions(args);
  const loadCompany = dependencies.loadCompany || loadDevCompany;
  const secrets = dependencies.store || store;
  const prompt = dependencies.prompt || readHiddenKey;
  const query = dependencies.query || queryManually;
  const log = dependencies.log || (value => console.log(JSON.stringify(value)));
  if (options.action === 'listar-empresas') {
    const companies = await (dependencies.listCompanies || listDevCompanies)();
    log({ outcome: 'NSDOCS_EMPRESAS_LOCAIS_DEV', companies, external_calls: 0 });
    return;
  }
  // CNPJ e cadastro ativo no banco DEV conferidos ANTES de pedir/ler a chave.
  const company = await loadCompany(options.companyId, options.cnpj);
  if (options.action === 'configurar') {
    let apiKey = await prompt({ signal: dependencies.signal });
    try {
      validKey(apiKey);
      secrets.saveCredentials({ companyId: company.id, companyCnpj: company.cnpj, apiKey });
      const summary = { outcome: 'NSDOCS_CREDENCIAL_DEV_GUARDADA', company_id: company.id, company_cnpj: company.cnpj,
        company_name: company.name, application_connector_enabled: false, external_calls: 0 };
      assertNoSecret(summary, apiKey); log(summary);
    } finally { apiKey = ''; }
    return;
  }
  if (options.action === 'conferir') {
    const credentials = secrets.loadCredentials();
    try {
      check(credentials.companyId === company.id && credentials.companyCnpj === company.cnpj, 'NSDOCS_EMPRESA_LOCAL_DIVERGENTE');
      const summary = { outcome: 'NSDOCS_CREDENCIAL_DEV_CONFERIDA', company_id: company.id, company_cnpj: company.cnpj,
        company_name: company.name, application_connector_enabled: false, external_calls: 0 };
      assertNoSecret(summary, credentials.apiKey); log(summary);
    } finally { credentials.apiKey = ''; }
    return;
  }
  const result = await query({ input: options.input, company, confirmed: true, signal: dependencies.signal });
  const summary = {
    outcome: 'NSDOCS_CONSULTA_MANUAL_DEV_CONCLUIDA', request_id: result.request_id,
    company_id: company.id, company_cnpj: company.cnpj, company_name: company.name,
    company_verified_in_response: result.company_verified_in_response,
    verification: result.company_verified_in_response ? 'CNPJ_DOS_DOCUMENTOS_CONFERIDO' : 'SEM_DOCUMENTOS_EMPRESA_AINDA_NAO_COMPROVADA',
    documents: result.documents.length, unsupported: result.unsupported.length,
    total: result.total, next_offset: result.next_offset, partition_required: result.partition_required,
    window_complete: result.window_complete, persisted: false, external_calls: 1,
    application_connector_enabled: false
  };
  if (options.showDocuments) summary.document_preview = result.documents.map(doc => ({
    number: doc.number, issued_on: doc.issued_on, issuer_name: doc.issuer_name,
    total_cents: doc.total_cents, fiscal_status: doc.fiscal_status, provider_usage_status: doc.provider_usage_status
  }));
  log(summary);
}
module.exports = { parseOptions, main };
if (require.main === module) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  main(process.argv.slice(2), { signal: controller.signal }).catch(error => {
    console.error(errorCode(error));
    console.error('Consulta interrompida. Nao compartilhe a chave, o arquivo privado ou saidas de documentos reais.');
    process.exitCode = 1;
  }).finally(() => { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); });
}
