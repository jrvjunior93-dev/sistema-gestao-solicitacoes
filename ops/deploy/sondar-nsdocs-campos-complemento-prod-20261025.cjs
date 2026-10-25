'use strict';
// Uma consulta da janela pendente. Nao grava resposta, altera plano ou baixa XML.
// Exibe somente nomes fixos de campos, tipos e motivos; nunca valores recebidos.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const PLAN = 'c456781c-4393-468b-858f-dbf220d8f215';
const at = name => require(path.join(BACKEND, 'src/modules/fiscal/services/nsdocsHistorical', name));
function check(ok, code) {
  if (!ok) { const error = Error(code); error.code = code; throw error; }
}
function textProblem(value, max, numericIdentifier = false) {
  if (numericIdentifier && typeof value === 'number') return null;
  if (typeof value !== 'string') return 'TIPO_NAO_TEXTUAL';
  if (!value.trim()) return 'TEXTO_VAZIO';
  if (value.length > max) return 'TAMANHO_EXCEDIDO';
  if (/[\u0000-\u001f]/.test(value)) return 'CARACTERE_DE_CONTROLE';
  return null;
}
function summarize(response, request, company, key, policy, normalizeResponse) {
  policy.assertNoSecret(response, key);
  check(Array.isArray(response.rows) && response.rows.length <= 100 &&
    Number.isSafeInteger(response.total) && response.total >= 0, 'NSDOCS_SONDA_RESPOSTA_INVALIDA');
  const issues = [];
  const add = (row, index, field, max, numeric = false) => {
    const value = row[field], reason = textProblem(value, max, numeric);
    if (reason) issues.push({ row_index: index, field,
      type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
      reason, ...(typeof value === 'string' ? { characters: value.length } : {}) });
  };
  response.rows.forEach((row, index) => {
    check(row && typeof row === 'object' && !Array.isArray(row) &&
      policy.companyCnpj(row.empresa_cnpj) === company.cnpj, 'NSDOCS_SONDA_EMPRESA_DIVERGENTE');
    add(row, index, 'id', 64, true);
    add(row, index, 'modelo', 30);
    if (row.modelo === 'NF-e') {
      add(row, index, 'emitente_nome', 200);
      add(row, index, 'destinatario_nome', 200);
      add(row, index, 'numero', 30, true);
      add(row, index, 'valor', 40);
      add(row, index, 'situacao', 80);
    }
  });
  let normalizationError = null;
  try { normalizeResponse(response, request, company); }
  catch (error) { normalizationError = policy.errorCode(error); }
  return { returned_rows: response.rows.length, total_header: response.total,
    normalization_error: normalizationError, invalid_text_fields: issues.slice(0, 20),
    invalid_text_fields_total: issues.length, fields_truncated: issues.length > 20 };
}
async function main(args, d = {}) {
  check(args.length === 3 && args[0] === '--plano-id' && args[1] === PLAN &&
    args[2] === '--confirmar-consulta-real', 'NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
  const runtime = d.runtime || at('manual/runtime'), policy = d.policy || at('manual/policy');
  const locks = d.locks || at('manual/planStore'), plans = d.plans || at('manual/complement/store');
  const core = d.core || at('manual/complement/plan'), secrets = d.secrets || at('manual/privateStore');
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
        journal('NSDOCS_SONDA_CAMPOS_INICIADA'); started = true;
        const response = await (d.request || at('manual/transport').requestDocuments)(request, key);
        const result = summarize(response, request, company, key, policy,
          d.normalizeResponse || at('manual/query').normalizeResponse);
        check(JSON.stringify(core.validate(plans.load(PLAN), company)) === before, 'NSDOCS_SONDA_PLANO_MUDOU');
        const out = { outcome: 'NSDOCS_SONDA_CAMPOS_COMPLEMENTO_PROD', plan_id: PLAN,
          start: window.start, end: window.end, status: window.status, offset: 0, limit: 100,
          ...result, external_nsdocs_calls: 1, xml_downloads: 0, database_writes: 0,
          storage_calls: 0, plan_changed: false, journal_events: 2 };
        policy.assertNoSecret(out, key);
        journal('NSDOCS_SONDA_CAMPOS_CONCLUIDA'); started = false;
        (d.log || console.log)(JSON.stringify(out)); return out;
      } finally {
        key = ''; if (credential) credential.apiKey = '';
        if (started) journal('NSDOCS_SONDA_CAMPOS_INTERROMPIDA');
      }
    });
  });
}
module.exports = { PLAN, textProblem, summarize, main };
if (require.main === module || process.argv[1] === '-') main(process.argv.slice(2)).catch(() => {
  console.error('NSDOCS_SONDA_CAMPOS_INTERROMPIDA_SEM_SEGREDOS');
  console.error('Preserve o plano e os locks; nao envie chave, valores recebidos ou XML.');
  process.exitCode = 1;
});
