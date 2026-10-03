const { Setor, User } = require('../models');
const AuthController = require('./AuthController');
const {
  buildAuthToken,
  decodeTokenExpiry,
  generateCsrfToken,
  setAuthCookies
} = require('../services/authSessionService');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const {
  assertDevUserSwitchRuntimeEnabled,
  buildDevUserSwitchSessionState,
  findConfiguredTarget,
  isSuperadmin,
  listEligibleUsers,
  saveConfiguredUserIds
} = require('../services/devUserSwitchService');

function sendError(res, error, fallback) {
  return res.status(error?.statusCode || 500).json({
    error: error?.statusCode ? error.message : fallback,
    code: error?.code
  });
}

async function issueSession(res, user, payload, stateArgs) {
  const [sessionUser, devUserSwitch] = await Promise.all([
    AuthController.buildSessionUser(user),
    buildDevUserSwitchSessionState(stateArgs)
  ]);
  const token = buildAuthToken(payload);
  setAuthCookies(res, token, generateCsrfToken());
  return res.json({
    token,
    session_expires_at: decodeTokenExpiry(token),
    user: sessionUser,
    dev_user_switch: devUserSwitch
  });
}

module.exports = {
  async status(req, res) {
    try {
      return res.json(await buildDevUserSwitchSessionState({
        currentUser: req.user,
        auth: req.auth,
        actor: req.dev_user_switch?.actor
      }));
    } catch (error) {
      return sendError(res, error, 'Erro ao carregar troca rapida de usuario.');
    }
  },

  async config(req, res) {
    try {
      assertDevUserSwitchRuntimeEnabled();
      if (!isSuperadmin(req.user) || req.auth?.dev_user_switch) {
        return res.status(403).json({ error: 'Apenas o SUPERADMIN original pode configurar os usuarios de teste.' });
      }
      const [users, sessionState] = await Promise.all([
        listEligibleUsers(),
        buildDevUserSwitchSessionState({ currentUser: req.user, auth: req.auth })
      ]);
      return res.json({
        enabled: true,
        user_ids: sessionState.users.map((user) => user.id),
        users
      });
    } catch (error) {
      return sendError(res, error, 'Erro ao carregar configuracao de usuarios de teste.');
    }
  },

  async updateConfig(req, res) {
    try {
      assertDevUserSwitchRuntimeEnabled();
      if (!isSuperadmin(req.user) || req.auth?.dev_user_switch) {
        return res.status(403).json({ error: 'Apenas o SUPERADMIN original pode configurar os usuarios de teste.' });
      }
      const userIds = await saveConfiguredUserIds(req.body?.user_ids);
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user.id,
        tipoEvento: 'DEV_USER_SWITCH_CONFIG_UPDATED',
        recursoTipo: 'CONFIGURACAO',
        recursoId: 'DEV_USER_SWITCH_USER_IDS',
        status: 'SUCCESS',
        descricao: 'Usuarios da troca rapida de desenvolvimento atualizados',
        metadata: { user_ids: userIds }
      });
      return res.json({ ok: true, user_ids: userIds });
    } catch (error) {
      return sendError(res, error, 'Erro ao salvar configuracao de usuarios de teste.');
    }
  },

  async assume(req, res) {
    try {
      assertDevUserSwitchRuntimeEnabled();
      const actor = req.dev_user_switch?.actor || req.user;
      if (!isSuperadmin(actor)) {
        return res.status(403).json({ error: 'Apenas SUPERADMIN pode iniciar a troca rapida de usuario.' });
      }

      const target = await findConfiguredTarget(req.body?.user_id);
      if (!target) {
        return res.status(404).json({ error: 'Usuario de teste nao configurado ou indisponivel.' });
      }
      if (Number(target.id) === Number(req.user?.id)) {
        return res.status(409).json({ error: 'Este usuario ja esta ativo na sessao de teste.' });
      }

      const startedAt = req.auth?.dev_user_switch?.started_at || new Date().toISOString();
      const impersonation = {
        actor_id: Number(actor.id),
        actor_token_version: Number(actor.token_version || 0),
        target_id: Number(target.id),
        started_at: startedAt
      };
      await registrarEventoSeguranca({
        req,
        usuarioId: actor.id,
        tipoEvento: 'DEV_USER_SWITCH_STARTED',
        recursoTipo: 'USER',
        recursoId: target.id,
        status: 'SUCCESS',
        descricao: 'SUPERADMIN iniciou sessao de teste como outro usuario',
        metadata: { actor_id: actor.id, target_id: target.id }
      });

      return issueSession(res, target, {
        id: target.id,
        perfil: target.perfil,
        area: target.setor?.codigo || null,
        setor_id: target.setor_id,
        token_version: Number(target.token_version || 0),
        mfa_setup_pending: false,
        dev_user_switch: impersonation
      }, {
        currentUser: target,
        auth: { dev_user_switch: impersonation },
        actor
      });
    } catch (error) {
      return sendError(res, error, 'Erro ao trocar o usuario de teste.');
    }
  },

  async restore(req, res) {
    try {
      assertDevUserSwitchRuntimeEnabled();
      const actor = req.dev_user_switch?.actor;
      if (!actor || !req.auth?.dev_user_switch) {
        return res.status(409).json({ error: 'Nao existe uma sessao de teste para encerrar.' });
      }
      const refreshedActor = await User.findByPk(actor.id, {
        attributes: {
          exclude: ['senha', 'mfa_totp_secret', 'mfa_totp_temp_secret']
        },
        include: [{
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
        }]
      });
      if (!refreshedActor || refreshedActor.ativo === false || !isSuperadmin(refreshedActor)) {
        return res.status(401).json({ error: 'A sessao original do SUPERADMIN nao esta mais valida.' });
      }

      await registrarEventoSeguranca({
        req,
        usuarioId: actor.id,
        tipoEvento: 'DEV_USER_SWITCH_ENDED',
        recursoTipo: 'USER',
        recursoId: req.user?.id,
        status: 'SUCCESS',
        descricao: 'SUPERADMIN encerrou sessao de teste como outro usuario',
        metadata: { actor_id: actor.id, target_id: req.user?.id }
      });

      return issueSession(res, refreshedActor, {
        id: refreshedActor.id,
        perfil: refreshedActor.perfil,
        area: refreshedActor.setor?.codigo || null,
        setor_id: refreshedActor.setor_id,
        token_version: Number(refreshedActor.token_version || 0),
        mfa_setup_pending: false
      }, {
        currentUser: refreshedActor,
        auth: null,
        actor: refreshedActor
      });
    } catch (error) {
      return sendError(res, error, 'Erro ao retornar para a sessao do SUPERADMIN.');
    }
  }
};
