'use strict';
const { randomUUID } = require('node:crypto');
const { check, companyCnpj, validateQuery, errorCode, verifyCompany, assertNoSecret } = require('./policy');
const store = require('./privateStore');
const { requestDocuments } = require('./transport');
const { normalizePage } = require('../normalize');
const { assertDevProcess } = require('./runtime');

function normalizeResponse(response, request, company) {
  check(Array.isArray(response.rows), 'NSDOCS_LISTA_INVALIDA');
  const rows = response.rows.map(row => {
    check(row && typeof row === 'object', 'NSDOCS_DOCUMENTO_INVALIDO');
    check(companyCnpj(row.empresa_cnpj) === company.cnpj, 'NSDOCS_EMPRESA_FORA_DO_ESCOPO');
    const result = { ...row, empresa_cnpj: company.cnpj };
    if (row.modelo === 'NF-e') {
      result.emitente_cnpj = companyCnpj(row.emitente_cnpj);
      result.destinatario_cnpj = companyCnpj(row.destinatario_cnpj);
    }
    return result;
  });
  const normalized = normalizePage(rows, request, response.total);
  return { ...normalized, documents: normalized.documents.map(doc => ({ ...doc, source_mode: 'manual' })) };
}

async function queryManually({ input, company, confirmed = false, signal }, dependencies = {}) {
  (dependencies.guard || assertDevProcess)();
  check(confirmed === true, 'NSDOCS_CONFIRMACAO_REAL_OBRIGATORIA');
  const secrets = dependencies.store || store;
  const send = dependencies.send || ((request, key, signal) => requestDocuments(request, key, undefined, signal));
  const clock = dependencies.clock || Date.now;
  return secrets.withLock(async () => {
    const credentials = secrets.loadCredentials();
    verifyCompany(company, credentials.companyId, credentials.companyCnpj);
    const request = validateQuery(input, credentials);
    secrets.checkCooldown(clock());
    const requestId = randomUUID();
    const event = outcome => ({ at: clock(), requestId, companyId: company.id, outcome });
    secrets.appendHistory(event('NSDOCS_CONSULTA_INICIADA'));
    try {
      const response = await send(request, credentials.apiKey, signal);
      const normalized = normalizeResponse(response, request, company);
      const result = {
        ...normalized, request_id: requestId, real_calls: true,
        company_verified_in_response: response.rows.length > 0,
        company_id: company.id, company_cnpj: company.cnpj,
        documents: normalized.documents.map(doc => ({ ...doc, source_mode: 'manual' }))
      };
      assertNoSecret(result, credentials.apiKey);
      secrets.appendHistory({ ...event('NSDOCS_CONSULTA_CONCLUIDA'), count: response.rows.length });
      return result;
    } catch (error) {
      const code = errorCode(error);
      secrets.appendHistory(event(code));
      const safe = new Error(code); safe.code = code; throw safe;
    } finally { credentials.apiKey = ''; }
  });
}
module.exports = { queryManually, normalizeResponse };
