'use strict';

const { BASE_URL, fail } = require('./config');

const FIELDS = [
  'id', 'empresa_cnpj', 'emitente_nome', 'emitente_cnpj', 'destinatario_nome',
  'destinatario_cnpj', 'numero', 'chave_acesso', 'data_emissao', 'data_recebimento',
  'valor', 'modelo', 'situacao', 'status'
];

function cnpj(value) {
  if (typeof value !== 'string' || !/^\d{14}$/.test(value)) fail('NSDOCS_CNPJ_INVALIDO');
  return value;
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('NSDOCS_DATA_INVALIDA');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail('NSDOCS_DATA_INVALIDA');
  }
  return value;
}

function providerDate(value) {
  if (typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) fail('NSDOCS_DATA_INVALIDA');
  return isoDate(value.split('/').reverse().join('-'));
}

function buildListRequest(options, allowedCompanyCnpj) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('NSDOCS_CONSULTA_INVALIDA');
  const allowed = ['companyCnpj', 'status', 'startDate', 'endDate', 'limit', 'offset', 'dateField'];
  if (Object.keys(options).some(key => !allowed.includes(key))) fail('NSDOCS_PARAMETRO_NAO_PERMITIDO');
  const company = cnpj(options.companyCnpj);
  if (company !== cnpj(allowedCompanyCnpj)) fail('NSDOCS_EMPRESA_FORA_DO_ESCOPO');
  // A omissao de status no provedor usa Pendente; exigir escolha evita perda silenciosa.
  if (!['Pendente', 'Importado'].includes(options.status)) fail('NSDOCS_STATUS_OBRIGATORIO');
  const start = isoDate(options.startDate);
  const end = isoDate(options.endDate);
  const dateField = options.dateField || 'data_recebimento';
  if (!['data_recebimento', 'data_emissao'].includes(dateField)) fail('NSDOCS_CAMPO_DATA_INVALIDO');
  if (start > end) fail('NSDOCS_PERIODO_INVALIDO');
  const limit = options.limit === undefined ? 100 : options.limit;
  const offset = options.offset === undefined ? 0 : options.offset;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset + limit > 2000) {
    fail('NSDOCS_PAGINACAO_INVALIDA');
  }
  const date = value => value.split('-').reverse().join('/');
  const query = new URLSearchParams({
    campos: FIELDS.join(','), quantidade: String(limit), deslocamento: String(offset),
    status: options.status, [dateField]: `${date(start)} - ${date(end)}`,
    ordenacao_campo: dateField, ordenacao_tipo: 'asc'
  });
  // Descritor puro. Nao contem token e NAO e executado como requisicao HTTP.
  return Object.freeze({
    method: 'GET', url: `${BASE_URL}/documentos?${query}`,
    headers: Object.freeze({ 'Empresa-Cnpj': company, Accept: 'application/json; charset=utf-8', 'Accept-Encoding': 'gzip, deflate' }),
    companyCnpj: company, status: options.status, startDate: start, endDate: end, limit, offset, dateField
  });
}

module.exports = { FIELDS, cnpj, isoDate, providerDate, buildListRequest };
