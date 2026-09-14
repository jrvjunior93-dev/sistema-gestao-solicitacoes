const { Op } = require('sequelize');
const { ConfiguracaoSistema, Setor, User } = require('../models');
const { env } = require('../config/env');

const CONFIG_KEY = 'DEV_USER_SWITCH_USER_IDS';
const MAX_CONFIGURED_USERS = 20;
const DEVELOPMENT_ENVIRONMENTS = new Set(['dev', 'development']);

function isDevUserSwitchRuntimeEnabled(runtime = env) {
  return runtime?.devUserSwitchEnabled === true
    && DEVELOPMENT_ENVIRONMENTS.has(String(runtime?.deploymentEnvironment || '').trim().toLowerCase());
}

function createUnavailableError() {
  const error = new Error('Recurso disponivel somente no ambiente de desenvolvimento.');
  error.statusCode = 404;
  error.code = 'DEV_USER_SWITCH_UNAVAILABLE';
  return error;
}

function assertDevUserSwitchRuntimeEnabled() {
  if (!isDevUserSwitchRuntimeEnabled()) {
    throw createUnavailableError();
  }
}

function isSuperadmin(user) {
  return String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

function normalizeUserIds(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))]
    .slice(0, MAX_CONFIGURED_USERS);
}

function parseConfiguredUserIds(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return normalizeUserIds(Array.isArray(parsed) ? parsed : parsed?.user_ids);
  } catch {
    return [];
  }
}

function toUserSummary(user) {
  if (!user) return null;
  const plain = user?.get ? user.get({ plain: true }) : user;
  return {
    id: Number(plain.id),
    nome: plain.nome,
    email: plain.email,
    perfil: plain.perfil,
    setor_id: plain.setor_id,
    setor: plain.setor ? {
      id: plain.setor.id,
      nome: plain.setor.nome,
      codigo: plain.setor.codigo
    } : null
  };
}

const USER_INCLUDE = [{
  model: Setor,
  as: 'setor',
  attributes: [
    'id',
    'nome',
    'codigo',
    'eh_setor_obra',
    'eh_setor_financeiro',
    'eh_setor_compras',
    'eh_setor_geo',
    'eh_setor_administrativo'
  ]
}];

async function getConfiguredUserIds() {
  assertDevUserSwitchRuntimeEnabled();
  const config = await ConfiguracaoSistema.findOne({
    where: { chave: CONFIG_KEY },
    order: [['id', 'DESC']]
  });
  return parseConfiguredUserIds(config?.valor);
}

async function listConfiguredUsers() {
  const ids = await getConfiguredUserIds();
  if (!ids.length) return [];
  const users = await User.findAll({
    where: {
      id: { [Op.in]: ids },
      ativo: true
    },
    attributes: ['id', 'nome', 'email', 'perfil', 'setor_id'],
    include: USER_INCLUDE
  });
  const byId = new Map(users
    .filter((user) => !isSuperadmin(user))
    .map((user) => [Number(user.id), toUserSummary(user)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function listEligibleUsers() {
  assertDevUserSwitchRuntimeEnabled();
  const users = await User.findAll({
    where: {
      ativo: true
    },
    attributes: ['id', 'nome', 'email', 'perfil', 'setor_id'],
    include: USER_INCLUDE,
    order: [['nome', 'ASC'], ['id', 'ASC']]
  });
  return users.filter((user) => !isSuperadmin(user)).map(toUserSummary);
}

async function saveConfiguredUserIds(values) {
  assertDevUserSwitchRuntimeEnabled();
  const requestedIds = normalizeUserIds(values);
  const validUsers = requestedIds.length ? await User.findAll({
    where: {
      id: { [Op.in]: requestedIds },
      ativo: true
    },
    attributes: ['id', 'perfil']
  }) : [];
  const validSet = new Set(validUsers
    .filter((user) => !isSuperadmin(user))
    .map((user) => Number(user.id)));
  const userIds = requestedIds.filter((id) => validSet.has(id));

  if (userIds.length !== requestedIds.length) {
    const error = new Error('A lista contem usuario inexistente, inativo ou SUPERADMIN.');
    error.statusCode = 400;
    error.code = 'DEV_USER_SWITCH_INVALID_TARGET';
    throw error;
  }

  const value = JSON.stringify({ user_ids: userIds });
  const current = await ConfiguracaoSistema.findOne({
    where: { chave: CONFIG_KEY },
    order: [['id', 'DESC']]
  });
  if (current) await current.update({ valor: value });
  else await ConfiguracaoSistema.create({ chave: CONFIG_KEY, valor: value });
  return userIds;
}

async function findConfiguredTarget(userId) {
  assertDevUserSwitchRuntimeEnabled();
  const normalizedId = Number(userId);
  const configuredIds = await getConfiguredUserIds();
  if (!Number.isInteger(normalizedId) || !configuredIds.includes(normalizedId)) return null;
  const target = await User.findOne({
    where: {
      id: normalizedId,
      ativo: true
    },
    attributes: {
      exclude: ['senha', 'mfa_totp_secret', 'mfa_totp_temp_secret']
    },
    include: USER_INCLUDE
  });
  return target && !isSuperadmin(target) ? target : null;
}

async function buildDevUserSwitchSessionState({ currentUser, auth, actor } = {}) {
  if (!isDevUserSwitchRuntimeEnabled()) return { enabled: false };
  const impersonation = auth?.dev_user_switch;
  if (!impersonation && !isSuperadmin(currentUser)) return { enabled: false };

  const resolvedActor = actor || (!impersonation && isSuperadmin(currentUser) ? currentUser : null);
  return {
    enabled: true,
    impersonating: Boolean(impersonation),
    actor: toUserSummary(resolvedActor),
    current_user_id: Number(currentUser?.id || 0) || null,
    users: await listConfiguredUsers()
  };
}

module.exports = {
  CONFIG_KEY,
  MAX_CONFIGURED_USERS,
  assertDevUserSwitchRuntimeEnabled,
  buildDevUserSwitchSessionState,
  findConfiguredTarget,
  isDevUserSwitchRuntimeEnabled,
  isSuperadmin,
  listConfiguredUsers,
  listEligibleUsers,
  normalizeUserIds,
  parseConfiguredUserIds,
  saveConfiguredUserIds,
  toUserSummary
};
