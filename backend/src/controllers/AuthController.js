const bcrypt = require('bcryptjs');
const { Op, fn, col, where } = require('sequelize');
const { User, Setor } = require('../models');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const { getModuloConfig } = require('../services/moduleConfigService');
const {
  canAccessFinanceiro,
  getAreaPermissionStateForUser,
  getRhDpCapabilitiesForUser
} = require('../services/authorizationService');
const { marcarAtividadeUsuario } = require('../services/userActivityService');
const {
  buildAuthToken,
  buildMfaChallengeToken,
  clearAuthCookies,
  decodeTokenExpiry,
  generateCsrfToken,
  setAuthCookies,
  setCsrfHeader,
  setCsrfCookie,
  verifyMfaChallengeToken
} = require('../services/authSessionService');
const { env } = require('../config/env');
const {
  buildTotpSetup,
  generateTotpSecret,
  verifyTotpCode
} = require('../services/mfaService');
const { isMfaRequiredProfile } = require('../services/mfaPolicyService');
const {
  lerSegredoTotp,
  segredoIlegivel,
  SEGREDO_ILEGIVEL: SEGREDO_ILEGIVEL_TEMP,
  MENSAGEM_ILEGIVEL
} = require('../services/mfaSecretService');
const { listarSetoresDoUsuario } = require('../services/usuariosSetores');
const { obterAcessoPrioridadeDiretoriaPorUsuario } = require('../services/prioridadeDiretoriaAcesso');
const { obterSetoresVisiveisUsuario } = require('../services/setoresVisiveisUsuarioService');
const {
  requestPasswordResetByEmail,
  resetPasswordByToken
} = require('../services/passwordResetService');
const {
  calcularEstadoGuardUsuario
} = require('../modules/custosRecebiveis/services/obrigacaoService');
const { obterTelaInicialValidada } = require('../services/telaInicialService');
const {
  buildDevUserSwitchSessionState,
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
async function findUserByEmail(emailNormalizado) {
  return User.findOne({
    where: {
      [Op.or]: [
        { email: emailNormalizado },
        where(fn('LOWER', fn('TRIM', col('email'))), emailNormalizado)
      ]
    },
    include: [
      {
        model: Setor,
        as: 'setor',
        attributes: SETOR_ATTRIBUTES
      }
    ]
  });
}

async function buildSessionUser(user) {
  const modules = await getModuloConfig();
  const financeiroLiberado = await canAccessFinanceiro(user);
  const capacidadesRhDp = await getRhDpCapabilitiesForUser(user);
  const areasPermissionState = await getAreaPermissionStateForUser(user);
  const areasPermissoes = areasPermissionState.bypass ? [] : areasPermissionState.permissions;
  const prioridadeDiretoriaAcesso = await obterAcessoPrioridadeDiretoriaPorUsuario(user.id);
  const mfaRequiredByPolicy = isMfaRequiredProfile(user);
  const mfaEnabled = Boolean(user.mfa_totp_enabled);
  const setores = await listarSetoresDoUsuario(user);
  const setoresVisiveis = await obterSetoresVisiveisUsuario(user.id);
  const custosRecebiveisEnabled = modules.some((item) => (
    item?.key === 'CUSTOS_RECEBIVEIS' && item?.enabled
  ));
  const userForGuard = {
    ...(user?.get ? user.get({ plain: true }) : user),
    areas_permissoes: areasPermissoes,
    areas_permissoes_configuradas: Boolean(areasPermissionState.configured)
  };
  let custosRecebiveisPendencia = null;
  try {
    custosRecebiveisPendencia = await calcularEstadoGuardUsuario(userForGuard, {
      moduleEnabled: custosRecebiveisEnabled,
      persistir: custosRecebiveisEnabled
    });
  } catch (error) {
    console.error('Falha segura ao calcular pendencia de Custos e Recebiveis:', error.message);
    custosRecebiveisPendencia = {
      habilitado: custosRecebiveisEnabled,
      modo: 'observe',
      bloqueado: false,
      pendencia_detectada: false,
      indisponivel: true
    };
  }

  const sessionUser = {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    setor_id: user.setor_id,
    setor: user.setor,
    setores,
    setores_visiveis: setoresVisiveis,
    financeiro_liberado: Boolean(financeiroLiberado),
    rh_dp_capacidades: capacidadesRhDp.filter((item) => item.startsWith('rh_dp_')),
    integracao_sienge_capacidades: capacidadesRhDp.filter((item) => item.startsWith('integracao_sienge_')),
    areas_permissoes: areasPermissoes,
    areas_permissoes_configuradas: Boolean(areasPermissionState.configured),
    prioridade_diretoria_acesso: prioridadeDiretoriaAcesso,
    pode_criar_solicitacao_compra: Boolean(user.pode_criar_solicitacao_compra),
    pode_enviar_qualquer_setor: Boolean(user.pode_enviar_qualquer_setor),
    modulos_habilitados: modules,
    mfa_totp_enabled: Boolean(user.mfa_totp_enabled),
    mfa_required_by_policy: mfaRequiredByPolicy,
    mfa_setup_pending: mfaRequiredByPolicy && !mfaEnabled,
    custos_recebiveis_pendencia: custosRecebiveisPendencia
  };

  sessionUser.dev_user_switch_enabled = isDevUserSwitchRuntimeEnabled() && isSuperadmin(user);

  // Tela inicial escolhida pelo usuário, validada no backend contra as
  // permissões ATUAIS (mesma fonte única do frontend). Inválida = null
  // (o login cai na Home) e a preferência já foi limpa pelo serviço.
  sessionUser.tela_inicial = await obterTelaInicialValidada(sessionUser);

  return sessionUser;
}

function buildAuthPayload(user) {
  return {
    id: user.id,
    perfil: user.perfil,
    area: user.setor?.codigo || null,
    setor_id: user.setor_id,
    token_version: Number(user.token_version || 0)
  };
}

async function issueAuthenticatedSession(req, res, user, options = {}) {
  const token = buildAuthToken({
    ...buildAuthPayload(user),
    mfa_setup_pending: Boolean(options.mfaSetupPending)
  });
  const csrfToken = generateCsrfToken();
  setAuthCookies(res, token, csrfToken);

  await registrarEventoSeguranca({
    req,
    usuarioId: user.id,
    tipoEvento: 'AUTH_LOGIN_SUCCESS',
    recursoTipo: 'AUTH',
    recursoId: user.id,
    status: 'SUCCESS',
    descricao: 'Login efetuado com sucesso'
  });

  await marcarAtividadeUsuario(user.id);

  return {
    token,
    session_expires_at: decodeTokenExpiry(token),
    user: await buildSessionUser(user),
    dev_user_switch: await buildDevUserSwitchSessionState({ currentUser: user })
  };
}

module.exports = {
  // Reutilizado pelo TelaInicialController: monta o MESMO objeto de
  // sessão que o frontend recebe, para validar permissão de tela com
  // entradas idênticas às da fonte única.
  buildSessionUser,

  async login(req, res) {
    try {
      const emailNormalizado = String(req.body?.email || '').trim().toLowerCase();
      const senha = req.body?.senha;
      const user = await findUserByEmail(emailNormalizado);

      if (!user || !user.senha || user.ativo === false) {
        await registrarEventoSeguranca({
          req,
          tipoEvento: 'AUTH_LOGIN_FAILURE',
          recursoTipo: 'AUTH',
          recursoId: emailNormalizado || null,
          status: 'DENIED',
          descricao: 'Tentativa de login com credenciais invalidas'
        });
        return res.status(401).json({ error: 'Credenciais invalidas' });
      }

      const ok = await bcrypt.compare(String(senha), String(user.senha));
      if (!ok) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_LOGIN_FAILURE',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'DENIED',
          descricao: 'Tentativa de login com credenciais invalidas'
        });
        return res.status(401).json({ error: 'Credenciais invalidas' });
      }

      if (user.force_password_reset) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_PASSWORD_RESET_REQUIRED',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'DENIED',
          descricao: 'Login bloqueado ate definicao ou redefinicao de senha'
        });

        return res.status(403).json({
          error: 'Sua senha precisa ser definida ou redefinida antes do acesso.',
          code: 'PASSWORD_RESET_REQUIRED',
          password_reset_required: true
        });
      }

      const mfaRequiredByPolicy = isMfaRequiredProfile(user);

      // A ordem importa: o segredo so e lido quando o MFA esta LIGADO para o usuario. Com o MFA
      // desligado o segredo e irrelevante, e ler antes faria um valor guardado (que pode nem
      // decifrar) barrar quem nem usa segundo fator.
      //
      // Ligado o MFA, segredo que nao decifra NAO pode virar "usuario sem MFA": isso transformaria
      // uma falha de chave em bypass do segundo fator. Recusa com motivo — e sem o motivo, isto
      // aparecia como 500 opaco no login, que foi como o defeito chegou.
      const segredoTotp = user.mfa_totp_enabled ? lerSegredoTotp(user) : null;
      if (segredoIlegivel(segredoTotp)) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_MFA_SECRET_UNREADABLE',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'DENIED',
          descricao: 'Segredo TOTP nao pode ser decifrado com a chave atual'
        });
        return res.status(503).json({ error: MENSAGEM_ILEGIVEL, code: 'MFA_SECRET_UNREADABLE' });
      }

      const mfaEnabled = Boolean(user.mfa_totp_enabled && segredoTotp);

      if (mfaEnabled) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_MFA_CHALLENGE_ISSUED',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'INFO',
          descricao: 'Senha validada, MFA pendente para conclusao do login'
        });

        return res.json({
          mfa_required: true,
          challenge_token: buildMfaChallengeToken(user),
          user: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            perfil: user.perfil,
            mfa_totp_enabled: true
          }
        });
      }

      if (mfaRequiredByPolicy) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_MFA_SETUP_REQUIRED',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'INFO',
          descricao: 'Login permitido apenas para concluir configuracao obrigatoria de MFA'
        });

        return res.json(await issueAuthenticatedSession(req, res, user, { mfaSetupPending: true }));
      }

      return res.json(await issueAuthenticatedSession(req, res, user, { mfaSetupPending: false }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro no login' });
    }
  },

  async loginMfa(req, res) {
    try {
      const { challenge_token: challengeToken, codigo } = req.body;

      let decoded;
      try {
        decoded = verifyMfaChallengeToken(challengeToken);
      } catch {
        return res.status(401).json({ error: 'Desafio MFA invalido ou expirado.' });
      }

      const user = await User.findByPk(decoded.id, {
        include: [
          {
            model: Setor,
            as: 'setor',
            attributes: SETOR_ATTRIBUTES
          }
        ]
      });

      if (!user || user.ativo === false || !user.mfa_totp_enabled) {
        return res.status(401).json({ error: 'MFA nao esta disponivel para este usuario.' });
      }
      const segredoDesafio = lerSegredoTotp(user);
      if (segredoIlegivel(segredoDesafio)) {
        return res.status(503).json({ error: MENSAGEM_ILEGIVEL, code: 'MFA_SECRET_UNREADABLE' });
      }
      if (!segredoDesafio) {
        return res.status(401).json({ error: 'MFA nao esta disponivel para este usuario.' });
      }
      if (Number(decoded.token_version || 0) !== Number(user.token_version || 0)) {
        return res.status(401).json({ error: 'Desafio MFA revogado. Inicie o login novamente.' });
      }

      if (!verifyTotpCode(segredoDesafio, codigo)) {
        await registrarEventoSeguranca({
          req,
          usuarioId: user.id,
          tipoEvento: 'AUTH_MFA_FAILURE',
          recursoTipo: 'AUTH',
          recursoId: user.id,
          status: 'DENIED',
          descricao: 'Codigo MFA invalido no login'
        });
        return res.status(401).json({ error: 'Codigo de autenticacao invalido.' });
      }

      await user.update({
        mfa_totp_last_verified_at: new Date()
      });

      await registrarEventoSeguranca({
        req,
        usuarioId: user.id,
        tipoEvento: 'AUTH_MFA_SUCCESS',
        recursoTipo: 'AUTH',
        recursoId: user.id,
        status: 'SUCCESS',
        descricao: 'MFA validado com sucesso no login'
      });

      return res.json(await issueAuthenticatedSession(req, res, user, { mfaSetupPending: false }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao validar autenticacao em duas etapas.' });
    }
  },

  async forgotPassword(req, res) {
    try {
      return res.json(await requestPasswordResetByEmail(req.body?.email, req));
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({
        error: err.statusCode ? err.message : 'Erro ao solicitar recuperacao de senha.',
        code: err.code
      });
    }
  },

  async resetPassword(req, res) {
    try {
      return res.json(await resetPasswordByToken(req.body?.token, req.body?.senha, req));
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({
        error: err.statusCode ? err.message : 'Erro ao redefinir senha.',
        code: err.code,
        details: err.details
      });
    }
  },

  async me(req, res) {
    try {
      if (req.auth_mode === 'cookie') {
        const currentCsrfToken = String(req.cookies?.[env.csrfCookieName] || '').trim();
        if (currentCsrfToken) {
          setCsrfHeader(res, currentCsrfToken);
        } else {
          const expiresAtMs = Number(req.auth?.exp || 0) > 0
            ? (Number(req.auth.exp) * 1000) - Date.now()
            : null;
          setCsrfCookie(res, generateCsrfToken(), expiresAtMs && expiresAtMs > 0 ? expiresAtMs : null);
        }
      }

      return res.json({
        user: await buildSessionUser(req.user),
        session_expires_at: Number(req.auth?.exp || 0) > 0 ? Number(req.auth.exp) * 1000 : null,
        dev_user_switch: await buildDevUserSwitchSessionState({
          currentUser: req.user,
          auth: req.auth,
          actor: req.dev_user_switch?.actor
        })
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao carregar sessao atual.' });
    }
  },

  async logout(req, res) {
    try {
      if (req.user?.id && !req.dev_user_switch) {
        await User.increment('token_version', { by: 1, where: { id: req.user.id } });
      }
      clearAuthCookies(res);
      await registrarEventoSeguranca({
        req,
        usuarioId: req.dev_user_switch?.actor_id || req.user?.id || null,
        tipoEvento: 'AUTH_LOGOUT',
        recursoTipo: 'AUTH',
        recursoId: req.user?.id || null,
        status: 'SUCCESS',
        descricao: req.dev_user_switch
          ? 'Logout efetuado durante sessao de teste de usuario'
          : 'Logout efetuado com sucesso'
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao encerrar sessao.' });
    }
  },

  async mfaSetup(req, res) {
    try {
      const user = await User.findByPk(req.user?.id);
      if (!user || user.ativo === false) {
        return res.status(404).json({ error: 'Usuario nao encontrado.' });
      }

      // So interessa quando o MFA esta LIGADO: com ele desligado, configurar de novo e o fluxo
      // normal. Ligado, um segredo ilegivel nao pode passar por "nao configurado" — isso deixaria
      // reconfigurar o MFA sem provar posse do fator anterior.
      if (user.mfa_totp_enabled) {
        const segredoAtual = lerSegredoTotp(user);
        if (segredoIlegivel(segredoAtual)) {
          return res.status(503).json({ error: MENSAGEM_ILEGIVEL, code: 'MFA_SECRET_UNREADABLE' });
        }
        if (segredoAtual) {
          return res.status(409).json({ error: 'MFA ja esta habilitado para este usuario.' });
        }
      }

      const secret = generateTotpSecret();
      const setup = await buildTotpSetup(user, secret);

      await user.update({
        mfa_totp_temp_secret: secret
      });

      return res.json(setup);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao iniciar configuracao do MFA.' });
    }
  },

  async mfaEnable(req, res) {
    try {
      const user = await User.findByPk(req.user?.id);
      if (!user || user.ativo === false) {
        return res.status(404).json({ error: 'Usuario nao encontrado.' });
      }

      // Mesma guarda do segredo definitivo: o temporario tambem e um campo decifrado, e um valor
      // ilegivel aqui derrubaria a confirmacao com 500 em vez de dizer o que houve.
      const segredoTemporario = (() => {
        try { return user.mfa_totp_temp_secret; } catch { return SEGREDO_ILEGIVEL_TEMP; }
      })();
      if (segredoTemporario === SEGREDO_ILEGIVEL_TEMP) {
        return res.status(503).json({ error: MENSAGEM_ILEGIVEL, code: 'MFA_SECRET_UNREADABLE' });
      }
      if (!segredoTemporario) {
        return res.status(400).json({ error: 'Nenhuma configuracao MFA pendente para este usuario.' });
      }

      if (!verifyTotpCode(segredoTemporario, req.body?.codigo)) {
        return res.status(401).json({ error: 'Codigo de autenticacao invalido.' });
      }

      await user.update({
        mfa_totp_enabled: true,
        mfa_totp_secret: segredoTemporario,
        mfa_totp_temp_secret: null,
        mfa_totp_last_verified_at: new Date(),
        token_version: Number(user.token_version || 0) + 1
      });

      await registrarEventoSeguranca({
        req,
        usuarioId: user.id,
        tipoEvento: 'AUTH_MFA_ENABLED',
        recursoTipo: 'AUTH',
        recursoId: user.id,
        status: 'SUCCESS',
        descricao: 'MFA habilitado pelo usuario'
      });

      await user.reload({
        include: [
          {
            model: Setor,
            as: 'setor',
            attributes: SETOR_ATTRIBUTES
          }
        ]
      });

      return res.json(await issueAuthenticatedSession(req, res, user, { mfaSetupPending: false }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao habilitar MFA.' });
    }
  },

  async mfaDisable(req, res) {
    try {
      const user = await User.findByPk(req.user?.id);
      if (!user || user.ativo === false) {
        return res.status(404).json({ error: 'Usuario nao encontrado.' });
      }

      if (!user.mfa_totp_enabled) {
        return res.status(400).json({ error: 'MFA nao esta habilitado para este usuario.' });
      }
      const segredoParaDesligar = lerSegredoTotp(user);
      if (segredoIlegivel(segredoParaDesligar)) {
        return res.status(503).json({ error: MENSAGEM_ILEGIVEL, code: 'MFA_SECRET_UNREADABLE' });
      }
      if (!segredoParaDesligar) {
        return res.status(400).json({ error: 'MFA nao esta habilitado para este usuario.' });
      }

      if (isMfaRequiredProfile(user)) {
        return res.status(403).json({ error: 'Este perfil exige MFA obrigatorio e nao pode desabilitar essa protecao.' });
      }

      if (!verifyTotpCode(segredoParaDesligar, req.body?.codigo)) {
        return res.status(401).json({ error: 'Codigo de autenticacao invalido.' });
      }

      await user.update({
        mfa_totp_enabled: false,
        mfa_totp_secret: null,
        mfa_totp_temp_secret: null,
        mfa_totp_last_verified_at: null,
        token_version: Number(user.token_version || 0) + 1
      });
      clearAuthCookies(res);

      await registrarEventoSeguranca({
        req,
        usuarioId: user.id,
        tipoEvento: 'AUTH_MFA_DISABLED',
        recursoTipo: 'AUTH',
        recursoId: user.id,
        status: 'SUCCESS',
        descricao: 'MFA desabilitado pelo usuario'
      });

      return res.json({ ok: true, mfa_totp_enabled: false });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao desabilitar MFA.' });
    }
  },

  async heartbeat(req, res) {
    try {
      await marcarAtividadeUsuario(req.user?.id);
      return res.json({ ok: true, recebido_em: new Date().toISOString() });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao registrar atividade da sessao' });
    }
  }
};
