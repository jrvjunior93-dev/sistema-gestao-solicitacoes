'use strict';

const { UsuarioObra } = require('../../../models');
const { isSuperadmin } = require('../../../services/authorizationService');
const { registrarEventoSeguranca } = require('../../../services/securityLogService');
const { hasSetorCapability } = require('../../../services/setorCapabilityService');
const { CUSTOS_RECEBIVEIS_PERMISSIONS } = require('../constants/custosRecebiveisConstants');
const { hasExplicitCustosRecebiveisPermission } = require('./permissionPolicy');

function usuarioEhSetorObra(user) {
  const setores = [user?.setor, ...(Array.isArray(user?.setores) ? user.setores : [])];
  if (setores.some((setor) => hasSetorCapability(setor, 'eh_setor_obra'))) return true;

  return hasSetorCapability({ codigo: user?.area, nome: user?.area }, 'eh_setor_obra');
}

async function resolverEscopoObras(user, dependencies = {}) {
  const isSuperadminResolver = dependencies.isSuperadmin || isSuperadmin;
  const permissionResolver = dependencies.hasExplicitPermission || hasExplicitCustosRecebiveisPermission;
  const usuarioObraModel = dependencies.UsuarioObra || UsuarioObra;

  if (isSuperadminResolver(user)) {
    return { todas: true, obraIds: null };
  }

  // Usuarios do setor OBRA nunca ampliam o escopo por permissao global: o
  // vinculo em usuarios_obras e a fonte de verdade operacional. Isso evita
  // que uma permissao granular atribuida por engano exponha outra obra.
  if (!usuarioEhSetorObra(user) && await permissionResolver(
    user,
    CUSTOS_RECEBIVEIS_PERMISSIONS.ALL_OBRAS_SCOPE
  )) {
    return { todas: true, obraIds: null };
  }

  const vinculos = await usuarioObraModel.findAll({
    where: { user_id: user?.id },
    attributes: ['obra_id'],
    raw: true
  });

  return {
    todas: false,
    obraIds: [...new Set(vinculos.map((item) => Number(item.obra_id)).filter(Number.isInteger))]
  };
}

async function usuarioPodeAcessarObra(user, obraId, dependencies = {}) {
  const normalizedObraId = Number(obraId);
  if (!Number.isInteger(normalizedObraId) || normalizedObraId <= 0) {
    return false;
  }

  const escopo = await resolverEscopoObras(user, dependencies);
  return escopo.todas || escopo.obraIds.includes(normalizedObraId);
}

function requireCustosRecebiveisObraScope(resolveObraId = (req) => (
  req.params?.obraId || req.params?.obra_id || req.body?.obra_id || req.query?.obra_id
)) {
  return async (req, res, next) => {
    try {
      const obraId = await resolveObraId(req);
      if (await usuarioPodeAcessarObra(req.user, obraId)) {
        return next();
      }

      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'AUTHZ_DENIED',
        recursoTipo: 'CUSTOS_RECEBIVEIS_OBRA',
        recursoId: obraId != null ? String(obraId) : req.originalUrl,
        status: 'DENIED',
        descricao: 'Acesso direto negado a obra fora do escopo de Custos e Recebiveis',
        metadata: { obra_id: obraId }
      });

      return res.status(403).json({ error: 'Acesso negado para esta obra' });
    } catch (error) {
      console.error('Erro ao validar escopo de obra em Custos e Recebiveis:', error.message);
      return res.status(500).json({ error: 'Erro ao validar escopo de obra' });
    }
  };
}

module.exports = {
  requireCustosRecebiveisObraScope,
  resolverEscopoObras,
  usuarioEhSetorObra,
  usuarioPodeAcessarObra
};
