const { Op } = require('sequelize');
const { Setor } = require('../models');
const { listarSetoresDoUsuario } = require('./usuariosSetores');

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function inferLegacyCapabilities(setor) {
  const codigo = normalizeToken(setor?.codigo);
  const nome = normalizeToken(setor?.nome);
  const tokens = [codigo, nome].filter(Boolean);
  const has = (token) => tokens.includes(token);

  return {
    eh_setor_obra: has('OBRA'),
    eh_setor_financeiro: has('FINANCEIRO'),
    eh_setor_compras: has('COMPRAS'),
    eh_setor_geo: ['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS'].some(has),
    eh_setor_administrativo: has('ADMINISTRATIVO')
  };
}

function getSetorCapabilities(setor) {
  const legacy = inferLegacyCapabilities(setor);
  const read = (field) => (typeof setor?.[field] === 'boolean' ? setor[field] : legacy[field]);

  return {
    eh_setor_obra: read('eh_setor_obra'),
    eh_setor_financeiro: read('eh_setor_financeiro'),
    eh_setor_compras: read('eh_setor_compras'),
    eh_setor_geo: read('eh_setor_geo'),
    eh_setor_administrativo: read('eh_setor_administrativo')
  };
}

function hasSetorCapability(setor, capability) {
  return Boolean(getSetorCapabilities(setor)?.[capability]);
}

function getGeoAliasTokens() {
  return ['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS'];
}

function isGeoToken(value) {
  return getGeoAliasTokens().includes(normalizeToken(value));
}

const SETORES_DP = new Set(['DP', 'DEPARTAMENTO_PESSOAL']);

function isDpSetor(value) {
  if (value && typeof value === 'object') {
    return [value.codigo, value.nome].some((item) => SETORES_DP.has(normalizeToken(item)));
  }
  return SETORES_DP.has(normalizeToken(value));
}

async function userBelongsToDpSetor(user) {
  const setores = await listarSetoresDoUsuario(user);
  return setores.some(isDpSetor) || isDpSetor(user?.area);
}

function buildSetorComparisonTokens(setor) {
  const capabilities = getSetorCapabilities(setor);
  const tokens = new Set([
    normalizeToken(setor?.id),
    normalizeToken(setor?.codigo),
    normalizeToken(setor?.nome)
  ].filter(Boolean));

  if (capabilities.eh_setor_geo) {
    getGeoAliasTokens().forEach((token) => tokens.add(token));
  }

  if (capabilities.eh_setor_obra) {
    tokens.add('OBRA');
  }

  if (capabilities.eh_setor_financeiro) {
    tokens.add('FINANCEIRO');
  }

  if (capabilities.eh_setor_compras) {
    tokens.add('COMPRAS');
  }

  if (capabilities.eh_setor_administrativo) {
    tokens.add('ADMINISTRATIVO');
  }
  return Array.from(tokens);
}

async function resolveSetorReferencia(value, options = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const valor = String(value).trim();
  const where = [];
  const id = Number(valor);
  if (Number.isInteger(id) && id > 0) {
    where.push({ id });
  }
  where.push({ codigo: valor });
  where.push({ nome: valor });

  return Setor.findOne({
    where: { [Op.or]: where },
    attributes: options.attributes || undefined
  });
}

async function resolveUserSetor(user, options = {}) {
  if (user?.setor && (user.setor.id || user.setor.codigo || user.setor.nome)) {
    return user.setor;
  }

  if (user?.setor_id) {
    return resolveSetorReferencia(user.setor_id, options);
  }

  if (user?.area) {
    return resolveSetorReferencia(user.area, options);
  }

  return null;
}

async function userHasSetorCapability(user, capability) {
  const setor = await resolveUserSetor(user);
  if (setor) {
    return hasSetorCapability(setor, capability);
  }

  const fallbackSetor = {
    codigo: user?.area || null,
    nome: user?.area || null
  };
  return hasSetorCapability(fallbackSetor, capability);
}

async function findSetorByCapability(capability, options = {}) {
  const where = {
    [capability]: true
  };

  if (options.onlyActive !== false) {
    where.ativo = true;
  }

  return Setor.findOne({
    where,
    order: [['id', 'ASC']],
    attributes: options.attributes || undefined,
    transaction: options.transaction
  });
}

function resolveSetorPersistenciaValue(setor, fallback = null) {
  const value = String(setor?.codigo || setor?.nome || fallback || '').trim();
  return value || null;
}

function normalizeSetorCode(value) {
  return normalizeToken(value).replace(/^_+|_+$/g, '');
}

module.exports = {
  buildSetorComparisonTokens,
  getSetorCapabilities,
  hasSetorCapability,
  inferLegacyCapabilities,
  isDpSetor,
  isGeoToken,
  normalizeSetorCode,
  normalizeToken,
  findSetorByCapability,
  resolveSetorPersistenciaValue,
  resolveSetorReferencia,
  resolveUserSetor,
  userBelongsToDpSetor,
  userHasSetorCapability
};
