'use strict';

const { ValidationError, ensureAllowedKeys } = require('../../../middlewares/validation');
const { SST_RESOURCE_CONFIG } = require('../constants/sstConstants');
const { onlyDigits, isValidCpf } = require('../../../utils/cpfCnpj');

function normalizeInt(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return parsed;
}

function normalizeDecimal(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return parsed;
}

function normalizeBoolean(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'ativo', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n', 'inativo', 'no'].includes(normalized)) return false;
  return fallback;
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    return `${year}-${month}-${day}`;
  }
  throw new ValidationError(`${fieldName} invalida.`);
}

function normalizeText(value, max = 255) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

function validateSstResourceParam(params = {}) {
  const resource = String(params.resource || '').trim().toLowerCase();
  if (!SST_RESOURCE_CONFIG[resource]) {
    throw new ValidationError('Recurso SST invalido.', 404);
  }
  return { ...params, resource };
}

function validateSstResourceWithIdParam(params = {}) {
  const parsed = validateSstResourceParam(params);
  const id = normalizeInt(params.id, 'ID', { required: true });
  return { ...parsed, id: String(id) };
}

function validateSstQuery(query = {}) {
  return {
    empresa_id: normalizeInt(query.empresa_id, 'Empresa'),
    obra_id: normalizeInt(query.obra_id, 'Obra/Centro de custo'),
    colaborador_id: normalizeInt(query.colaborador_id, 'Colaborador'),
    status: normalizeText(query.status, 60),
    ativo: query.ativo === undefined ? undefined : normalizeBoolean(query.ativo),
    search: normalizeText(query.search, 120),
    page: normalizeInt(query.page, 'Pagina') || 1,
    limit: Math.min(normalizeInt(query.limit, 'Limite') || 50, 200)
  };
}

function normalizeSstPayload(payload = {}, req) {
  const resource = req.params.resource;
  const config = SST_RESOURCE_CONFIG[resource];
  const allowed = [...new Set([...(config.createFields || []), ...(config.updateFields || [])])];
  ensureAllowedKeys(payload, allowed, 'Payload SST');

  const normalized = {};
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = payload[field];
    if (field.endsWith('_id') || ['quantidade', 'carga_horaria', 'dias_afastamento', 'score', 'peso', 'pendencias_total', 'pendencias_criticas', 'ordem', 'confianca'].includes(field)) {
      normalized[field] = ['quantidade', 'carga_horaria', 'score', 'confianca'].includes(field)
        ? normalizeDecimal(value, field)
        : normalizeInt(value, field);
    } else if (['ativo', 'apto', 'afastamento', 'cat_emitida', 'obrigatorio', 'utiliza_epc', 'epc_eficaz', 'utiliza_epi', 'epi_eficaz'].includes(field)) {
      normalized[field] = normalizeBoolean(value, null);
    } else if (
      field.includes('data_') ||
      field.includes('vigencia_') ||
      field.endsWith('_em') ||
      ['validade', 'entrega_em'].includes(field)
    ) {
      normalized[field] = normalizeDate(value, field);
    } else if (field === 'responsavel_tecnico_cpf') {
      if (value == null || String(value).trim() === '') {
        normalized[field] = null;
      } else if (!isValidCpf(value)) {
        throw new ValidationError('CPF do responsavel tecnico invalido.');
      } else {
        normalized[field] = onlyDigits(value);
      }
    } else {
      normalized[field] = normalizeText(value, field.includes('xml') || field === 'retorno' ? 1000000 : 5000);
    }
  }

  for (const field of config.requiredFields || []) {
    if (req.method === 'POST' && (normalized[field] === null || normalized[field] === undefined || normalized[field] === '')) {
      throw new ValidationError(`${field} e obrigatorio.`);
    }
  }

  return normalized;
}

module.exports = {
  validateSstQuery,
  validateSstResourceParam,
  validateSstResourceWithIdParam,
  normalizeSstPayload
};
