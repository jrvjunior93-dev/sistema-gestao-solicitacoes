const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { User, Setor } = require('../models');
const {
  canAccessFinanceiro,
  getAreaPermissionStateForUser,
  getRhDpCapabilitiesForUser
} = require('../services/authorizationService');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const { marcarAtividadeUsuario } = require('../services/userActivityService');
const {
  isDevUserSwitchRuntimeEnabled,
  isSuperadmin
} = require('../services/devUserSwitchService');

const SETOR_ATTRIBUTES = [
  'id',
  'nome',
  'codigo',
  'eh_setor_obra',
  'eh_setor_financeiro',
  'eh_setor_compras',
  'eh_setor_geo',
  'eh_setor_administrativo'
];

module.exports = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const cookieToken = String(req.cookies?.[env.authCookieName] || '').trim();

  let token = null;
  let authMode = null;

  if (authHeader) {
    const [scheme, headerToken] = authHeader.split(' ');
    if (String(scheme || '').toLowerCase() !== 'bearer' || !headerToken) {
      await registrarEventoSeguranca({
        req,
        tipoEvento: 'AUTH_TOKEN_INVALID',
        recursoTipo: 'AUTH',
        recursoId: req.originalUrl,
        status: 'DENIED',
        descricao: 'Cabecalho Authorization invalido'
      });
      return res.status(401).json({ error: 'Sessao invalida' });
    }

    token = headerToken;
    authMode = 'bearer';
  } else if (cookieToken) {
    token = cookieToken;
    authMode = 'cookie';
  }

  if (!token) {
    await registrarEventoSeguranca({
      req,
      tipoEvento: 'AUTH_TOKEN_MISSING',
      recursoTipo: 'AUTH',
      recursoId: req.originalUrl,
      status: 'DENIED',
      descricao: 'Requisicao protegida sem token'
    });
    return res.status(401).json({ error: 'Nao autenticado' });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(decoded.id, {
      attributes: {
        exclude: ['senha', 'mfa_totp_secret', 'mfa_totp_temp_secret']
      },
      include: [
        {
          model: Setor,
          as: 'setor',
          attributes: SETOR_ATTRIBUTES
        }
      ]
    });

    if (!user || user.ativo === false) {
      await registrarEventoSeguranca({
        req,
        usuarioId: decoded.id || null,
        tipoEvento: 'AUTH_TOKEN_INVALID',
        recursoTipo: 'AUTH',
        recursoId: req.originalUrl,
        status: 'DENIED',
        descricao: 'Token valido para usuario inexistente ou inativo'
      });
      return res.status(401).json({ error: 'Sessao invalida' });
    }
    if (Number(decoded.token_version || 0) !== Number(user.token_version || 0)) {
      await registrarEventoSeguranca({
        req,
        usuarioId: user.id,
        tipoEvento: 'AUTH_TOKEN_REVOKED',
        recursoTipo: 'AUTH',
        recursoId: req.originalUrl,
        status: 'DENIED',
        descricao: 'Token revogado por alteracao de credencial ou encerramento de sessao'
      });
      return res.status(401).json({ error: 'Sessao revogada. Entre novamente.' });
    }

    if (decoded.dev_user_switch) {
      const actorId = Number(decoded.dev_user_switch.actor_id);
      const targetId = Number(decoded.dev_user_switch.target_id);
      if (!isDevUserSwitchRuntimeEnabled() || !Number.isInteger(actorId) || targetId !== Number(user.id)) {
        return res.status(401).json({ error: 'Sessao de teste invalida ou indisponivel.' });
      }

      const actor = await User.findByPk(actorId, {
        attributes: {
          exclude: ['senha', 'mfa_totp_secret', 'mfa_totp_temp_secret']
        },
        include: [{
          model: Setor,
          as: 'setor',
          attributes: SETOR_ATTRIBUTES
        }]
      });
      if (
        !actor ||
        actor.ativo === false ||
        !isSuperadmin(actor) ||
        Number(decoded.dev_user_switch.actor_token_version || 0) !== Number(actor.token_version || 0)
      ) {
        return res.status(401).json({ error: 'Sessao original do SUPERADMIN revogada ou invalida.' });
      }
      req.dev_user_switch = {
        actor,
        actor_id: Number(actor.id),
        target_id: Number(user.id),
        started_at: decoded.dev_user_switch.started_at || null
      };
    }

    const [financeiroLiberado, capacidadesRhDp, areasPermissionState] = await Promise.all([
      canAccessFinanceiro(user),
      getRhDpCapabilitiesForUser(user),
      getAreaPermissionStateForUser(user)
    ]);
    const areasPermissoes = areasPermissionState.bypass ? [] : areasPermissionState.permissions;

    req.auth = decoded;
    req.auth_mode = authMode;
    req.user = {
      ...user.get({ plain: true }),
      area: user.setor?.codigo || null,
      financeiro_liberado: Boolean(financeiroLiberado),
      rh_dp_capacidades: capacidadesRhDp.filter((item) => item.startsWith('rh_dp_')),
      integracao_sienge_capacidades: capacidadesRhDp.filter((item) => item.startsWith('integracao_sienge_')),
      areas_permissoes: areasPermissoes,
      areas_permissoes_configuradas: Boolean(areasPermissionState.configured)
    };

    marcarAtividadeUsuario(user.id).catch(() => {});
    if (req.dev_user_switch?.actor_id) {
      marcarAtividadeUsuario(req.dev_user_switch.actor_id).catch(() => {});
    }

    return next();
  } catch (error) {
    await registrarEventoSeguranca({
      req,
      tipoEvento: 'AUTH_TOKEN_INVALID',
      recursoTipo: 'AUTH',
      recursoId: req.originalUrl,
      status: 'DENIED',
      descricao: 'Token rejeitado pelo backend'
    });
    return res.status(401).json({ error: 'Sessao invalida' });
  }
};
