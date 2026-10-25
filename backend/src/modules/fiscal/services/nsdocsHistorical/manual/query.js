'use strict';
const {check,companyCnpj}=require('./policy');
const {normalizePage}=require('../normalize');
const {cpf}=require('../contract');

function normalizeResponse(response, request, company) {
  check(Array.isArray(response.rows), 'NSDOCS_LISTA_INVALIDA');
  const rows = response.rows.map(row => {
    check(row && typeof row === 'object', 'NSDOCS_DOCUMENTO_INVALIDO');
    check(companyCnpj(row.empresa_cnpj) === company.cnpj, 'NSDOCS_EMPRESA_FORA_DO_ESCOPO');
    const result = { ...row, empresa_cnpj: company.cnpj };
    if (row.modelo === 'NF-e') {
      const issuer = row.emitente_cnpj;
      result.emitente_cnpj = typeof issuer === 'string' && /^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(issuer)
        ? cpf(issuer.replace(/\D/g, '')) : companyCnpj(issuer);
      result.destinatario_cnpj = companyCnpj(row.destinatario_cnpj);
    }
    return result;
  });
  const normalized = normalizePage(rows, request, response.total, { countMode: 'page' });
  // Ordenacao por data nao e unica. Capturas legadas cheias precisam de
  // descoberta/subdivisao; nao prosseguir por offset como prova de cobertura.
  const uncertain = normalized.next_offset !== null || request.offset > 0;
  return { ...normalized, ...(uncertain ? { next_offset: null, partition_required: true, window_complete: false } : {}),
    documents: normalized.documents.map(doc => ({ ...doc, source_mode: 'manual' })) };
}

module.exports={normalizeResponse};
