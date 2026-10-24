'use strict';
const {check,companyCnpj}=require('./policy');
const {normalizePage}=require('../normalize');

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

module.exports={normalizeResponse};
