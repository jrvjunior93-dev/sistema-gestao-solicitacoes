'use strict';
// Um GET da janela pendente. Somente tipos/formatos/DV; nunca valores pessoais.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const PLAN = 'c456781c-4393-468b-858f-dbf220d8f215';
const at = name => require(path.join(BACKEND, 'src/modules/fiscal/services/nsdocsHistorical', name));
function check(ok, code) {
  if (!ok) { const error = Error(code); error.code = code; throw error; }
}
function describe(value, validators) {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (type !== 'string') return { type, format: 'NAO_TEXTUAL', digits: null, valid_cnpj: false, valid_cpf: false };
  const format = !value.trim() ? 'VAZIO'
    : /^\d{14}$/.test(value) ? 'CNPJ_14_DIGITOS'
    : /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value) ? 'CNPJ_FORMATADO'
    : /^\d{11}$/.test(value) ? 'CPF_11_DIGITOS'
    : /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) ? 'CPF_FORMATADO' : 'OUTRO_FORMATO';
  return { type, format, digits: value.replace(/\D/g, '').length,
    valid_cnpj: ['CNPJ_14_DIGITOS', 'CNPJ_FORMATADO'].includes(format) && validators.isValidCnpj(value),
    valid_cpf: ['CPF_11_DIGITOS', 'CPF_FORMATADO'].includes(format) && validators.isValidCpf(value) };
}
function summarize(response, request, company, key, policy, normalizeResponse, validators) {
  policy.assertNoSecret(response, key);
  check(Array.isArray(response.rows) && response.rows.length <= 100 &&
    Number.isSafeInteger(response.total) && response.total >= 0, 'NSDOCS_SONDA_RESPOSTA_INVALIDA');
  const issues = []; let divergentCompanies = 0;
  response.rows.forEach((row, index) => {
    check(row && typeof row === 'object' && !Array.isArray(row), 'NSDOCS_SONDA_DOCUMENTO_INVALIDO');
    const fields = row.modelo === 'NF-e' ? ['empresa_cnpj', 'emitente_cnpj', 'destinatario_cnpj'] : ['empresa_cnpj'];
    for (const field of fields) {
      let reason = null, normalized;
      try { normalized = policy.companyCnpj(row[field]); }
      catch { reason = 'REJEITADO_PELA_VALIDACAO_CNPJ_ATUAL'; }
      if (field === 'empresa_cnpj' && !reason && normalized !== company.cnpj) {
        reason = 'EMPRESA_DIVERGENTE'; divergentCompanies++;
      }
      if (reason) issues.push({ row_index: index, field, reason, ...describe(row[field], validators) });
    }
  });
  let normalizationError = null;
  try { normalizeResponse(response, request, company); }
  catch (error) { normalizationError = policy.errorCode(error); }
  return { returned_rows: response.rows.length, total_header: response.total,
    normalization_error: normalizationError, invalid_identity_fields: issues.slice(0, 20),
    invalid_identity_fields_total: issues.length, fields_truncated: issues.length > 20,
    divergent_company_rows: divergentCompanies };
}
async function main(args, d = {}) {
  check(args.length === 3 && args[0] === '--plano-id' && args[1] === PLAN &&
    args[2] === '--confirmar-consulta-real', 'NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
  const runtime = d.runtime || at('manual/runtime'), policy = d.policy || at('manual/policy');
  const locks = d.locks || at('manual/planStore'), plans = d.plans || at('manual/complement/store');
  const core = d.core || at('manual/complement/plan'), secrets = d.secrets || at('manual/privateStore');
  const validators = d.validators || require(path.join(BACKEND, 'src/utils/cpfCnpj'));
  const company = await runtime.loadProdCompany(1, '27123008000100');
  return locks.withPlanLock(async () => {
    const plan = core.validate(plans.load(PLAN), company), before = JSON.stringify(plan);
    check(!plan.manifest_hash && !plan.windows.some(w => w.state === 'needs_review'), 'NSDOCS_SONDA_PLANO_NAO_ELEGIVEL');
    const window = plan.windows.find(w => w.state === 'pending');
    check(window, 'NSDOCS_SONDA_SEM_JANELA_PENDENTE');
    const build = d.buildListRequest || at('contract').buildListRequest;
    const request = build({ companyCnpj: company.cnpj, status: window.status,
      startDate: window.start, endDate: window.end, dateField: plan.date_field,
      limit: 100, offset: 0 }, company.cnpj);
    return secrets.withLock(async () => {
      secrets.checkCooldown(Date.now());
      const requestId = randomUUID(); let key = '', credential, started = false;
      const journal = outcome => secrets.appendHistory({ at: Date.now(), requestId, companyId: company.id, outcome });
      try {
        credential = secrets.loadCredentials();
        policy.verifyCompany(company, credential.companyId, credential.companyCnpj);
        key = credential.apiKey; credential.apiKey = '';
        journal('NSDOCS_SONDA_CNPJ_INICIADA'); started = true;
        const response = await (d.request || at('manual/transport').requestDocuments)(request, key);
        const result = summarize(response, request, company, key, policy,
          d.normalizeResponse || at('manual/query').normalizeResponse, validators);
        check(JSON.stringify(core.validate(plans.load(PLAN), company)) === before, 'NSDOCS_SONDA_PLANO_MUDOU');
        const out = { outcome: 'NSDOCS_SONDA_CNPJ_COMPLEMENTO_PROD', plan_id: PLAN,
          start: window.start, end: window.end, status: window.status, offset: 0, limit: 100,
          ...result, external_nsdocs_calls: 1, xml_downloads: 0, database_writes: 0,
          storage_calls: 0, plan_changed: false, journal_events: 2 };
        policy.assertNoSecret(out, key);
        journal('NSDOCS_SONDA_CNPJ_CONCLUIDA'); started = false;
        (d.log || console.log)(JSON.stringify(out)); return out;
      } finally {
        key = ''; if (credential) credential.apiKey = '';
        if (started) journal('NSDOCS_SONDA_CNPJ_INTERROMPIDA');
      }
    });
  });
}
module.exports = { PLAN, describe, summarize, main };
if (require.main === module || process.argv[1] === '-') main(process.argv.slice(2)).catch(error => {
  const code = /^NSDOCS_[A-Z0-9_]{1,100}$/.test(error?.code || '') ? error.code : 'NSDOCS_FALHA_SANITIZADA';
  console.error(code);
  console.error('NSDOCS_SONDA_CNPJ_INTERROMPIDA_SEM_SEGREDOS. Preserve planos/locks; nao envie valores pessoais ou XML.');
  process.exitCode = 1;
});
