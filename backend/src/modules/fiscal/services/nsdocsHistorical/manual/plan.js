'use strict';
const { randomUUID } = require('node:crypto');
const { isoDate } = require('../contract');
const { check, companyCnpj } = require('./policy');
// Planejamento puro: nao abre banco, nao usa chave e nao consome a API.
function historicalPlan({ companyId, cnpj, startDate, endDate, dateField = 'data_emissao' }, uuid = randomUUID) {
  companyCnpj(cnpj); isoDate(startDate); isoDate(endDate);
  check(Number.isSafeInteger(companyId) && companyId > 0 && startDate <= endDate,
    'NSDOCS_PLANO_INVALIDO');
  check(['data_emissao', 'data_recebimento'].includes(dateField), 'NSDOCS_CAMPO_DATA_INVALIDO');
  const start = Date.parse(startDate), end = Date.parse(endDate), day = 86400000;
  check((end - start) / day < 3660, 'NSDOCS_PLANO_LIMITE_10_ANOS');
  const windows = [];
  for (let from = start; from <= end; from += 31 * day) {
    const until = Math.min(end, from + 30 * day);
    windows.push({ inicio: new Date(from).toISOString().slice(0,10), fim: new Date(until).toISOString().slice(0,10),
      lotes_iniciais: ['Pendente', 'Importado'].map(status => ({ captura_id: uuid(), status, quantidade: 5, deslocamento: 0 })) });
  }
  return { outcome: 'NSDOCS_PLANO_HISTORICO_PROD', company_id: companyId, company_cnpj: cnpj,
    campo_data: dateField, windows, planning_only: true, company_verified: false,
    external_nsdocs_calls: 0, persisted: false, application_connector_enabled: false };
}
module.exports = { historicalPlan };
