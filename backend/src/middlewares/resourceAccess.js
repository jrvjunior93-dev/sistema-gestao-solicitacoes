const { Contrato, PedidoCompra, SolicitacaoCompra } = require('../models');
const {
  buildUserScopeTokens,
  canAccessContratosGlobal,
  getUserObraScopeIds,
  isBusinessAdmin,
  userCanCreateInAllObras
} = require('../services/authorizationService');
const { userHasSetorCapability } = require('../services/setorCapabilityService');
const { registrarEventoSeguranca } = require('../services/securityLogService');

async function hasLegacyContractGlobalAccess(tokens, user) {
  return (
    isBusinessAdmin(user) ||
    await canAccessContratosGlobal(user) ||
    tokens.includes('SUPERADMIN') ||
    (tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo'))
  );
}

async function hasLegacyCompraGlobalAccess(tokens, user) {
  return (
    tokens.includes('SUPERADMIN') ||
    tokens.includes('ADMIN') ||
    await userHasSetorCapability(user, 'eh_setor_compras') ||
    await userHasSetorCapability(user, 'eh_setor_geo')
  );
}

async function logResourceDenied(req, resourceType, resourceId, obraId, description) {
  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: resourceType,
    recursoId: resourceId != null ? resourceId : obraId,
    status: 'DENIED',
    descricao: description,
    metadata: {
      obra_id: obraId || null
    }
  });
}

function isOwnCompraResource(resource, user) {
  return Number(resource?.solicitante_id || 0) > 0
    && Number(resource.solicitante_id) === Number(user?.id);
}

function createBodyObraAccessMiddleware({
  bodyField,
  resourceType,
  description,
  hasLegacyGlobalAccess,
  hasCreationAccess,
  source = 'body',
  optional = false
}) {
  return async (req, res, next) => {
    if (optional && (req[source]?.[bodyField] === undefined || req[source]?.[bodyField] === null || String(req[source]?.[bodyField]).trim() === '')) {
      return next();
    }

    const obraId = Number(req[source]?.[bodyField]);
    if (!Number.isInteger(obraId) || obraId <= 0) {
      return res.status(400).json({ error: 'Obra invalida.' });
    }

    if (hasCreationAccess && await hasCreationAccess(req.user)) {
      return next();
    }

    const obrasPermitidas = await getUserObraScopeIds(req.user);
    if (obrasPermitidas === null) {
      return next();
    }

    if (obrasPermitidas.length > 0) {
      if (!obrasPermitidas.includes(obraId)) {
        await logResourceDenied(req, resourceType, null, obraId, description);
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }
      return next();
    }

    const tokens = await buildUserScopeTokens(req.user);
    if (await hasLegacyGlobalAccess(tokens, req.user)) {
      return next();
    }

    await logResourceDenied(req, resourceType, null, obraId, description);
    return res.status(403).json({ error: 'Acesso negado para esta obra' });
  };
}

function createScopedListMiddleware({
  queryField,
  resourceType,
  description,
  hasLegacyGlobalAccess,
  scopeKey
}) {
  return async (req, res, next) => {
    const obrasPermitidas = await getUserObraScopeIds(req.user);
    if (obrasPermitidas === null) {
      req[scopeKey] = null;
      return next();
    }

    const obraId = req.query?.[queryField] ? Number(req.query[queryField]) : null;

    if (obrasPermitidas.length > 0) {
      if (obraId && !obrasPermitidas.includes(obraId)) {
        await logResourceDenied(req, resourceType, null, obraId, description);
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }
      req[scopeKey] = obrasPermitidas;
      return next();
    }

    const tokens = await buildUserScopeTokens(req.user);
    if (await hasLegacyGlobalAccess(tokens, req.user)) {
      req[scopeKey] = null;
      return next();
    }

    req[scopeKey] = [];
    return next();
  };
}

function createResourceAccessMiddleware({
  model,
  paramField = 'id',
  resourceType,
  description,
  hasLegacyGlobalAccess,
  attachAs
}) {
  return async (req, res, next) => {
    const resourceId = Number(req.params?.[paramField]);
    const resource = await model.findByPk(resourceId);

    if (!resource) {
      return res.status(404).json({ error: `${resourceType} nao encontrado` });
    }

    const obraId = Number(resource.obra_id);
    if (resourceType === 'SOLICITACAO_COMPRA' && isOwnCompraResource(resource, req.user)) {
      req[attachAs] = resource;
      return next();
    }

    const obrasPermitidas = await getUserObraScopeIds(req.user);
    if (obrasPermitidas === null) {
      req[attachAs] = resource;
      return next();
    }

    if (obrasPermitidas.length > 0) {
      if (!obrasPermitidas.includes(obraId)) {
        await logResourceDenied(req, resourceType, resource.id, obraId, description);
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }
      req[attachAs] = resource;
      return next();
    }

    const tokens = await buildUserScopeTokens(req.user);
    if (await hasLegacyGlobalAccess(tokens, req.user)) {
      req[attachAs] = resource;
      return next();
    }

    await logResourceDenied(req, resourceType, resource.id, obraId, description);
    return res.status(403).json({ error: 'Acesso negado para esta obra' });
  };
}

const requireContratoBodyObraAccess = createBodyObraAccessMiddleware({
  bodyField: 'obra_id',
  resourceType: 'CONTRATO',
  description: 'Usuario tentou criar ou alterar contrato em obra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyContractGlobalAccess
});

const requireCompraBodyObraAccess = createBodyObraAccessMiddleware({
  bodyField: 'obra_id',
  resourceType: 'SOLICITACAO_COMPRA',
  description: 'Usuario tentou criar solicitacao de compra em obra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyCompraGlobalAccess,
  hasCreationAccess: userCanCreateInAllObras
});

// Referencias para preencher uma compra nova seguem o escopo de criacao, nao o da lista.
const requireCompraQueryObraCreationAccess = createBodyObraAccessMiddleware({
  bodyField: 'obra_id',
  source: 'query',
  resourceType: 'SOLICITACAO_COMPRA',
  description: 'Usuario tentou baixar modelo de compra em obra fora do seu escopo de criacao',
  hasLegacyGlobalAccess: hasLegacyCompraGlobalAccess,
  hasCreationAccess: userCanCreateInAllObras
});

const requireContratoOptionalBodyObraAccess = createBodyObraAccessMiddleware({
  bodyField: 'obra_id',
  resourceType: 'CONTRATO',
  description: 'Usuario tentou mover contrato para obra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyContractGlobalAccess,
  optional: true
});

const scopeCompraListAccess = createScopedListMiddleware({
  queryField: 'obra_id',
  resourceType: 'SOLICITACAO_COMPRA',
  description: 'Usuario tentou listar solicitacoes de compra de obra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyCompraGlobalAccess,
  scopeKey: 'compraScopeObraIds'
});

const requireContratoAccess = createResourceAccessMiddleware({
  model: Contrato,
  resourceType: 'CONTRATO',
  description: 'Usuario tentou acessar contrato fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyContractGlobalAccess,
  attachAs: 'contratoResource'
});

const requireCompraAccess = createResourceAccessMiddleware({
  model: SolicitacaoCompra,
  resourceType: 'SOLICITACAO_COMPRA',
  description: 'Usuario tentou acessar solicitacao de compra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyCompraGlobalAccess,
  attachAs: 'solicitacaoCompraResource'
});

const requirePedidoCompraAccess = createResourceAccessMiddleware({
  model: PedidoCompra,
  resourceType: 'PEDIDO_COMPRA',
  description: 'Usuario tentou acessar pedido de compra fora do seu escopo',
  hasLegacyGlobalAccess: hasLegacyCompraGlobalAccess,
  attachAs: 'pedidoCompraResource'
});

module.exports = {
  requireCompraAccess,
  requireCompraBodyObraAccess,
  requireCompraQueryObraCreationAccess,
  requireContratoAccess,
  requireContratoBodyObraAccess,
  requireContratoOptionalBodyObraAccess,
  requirePedidoCompraAccess,
  scopeCompraListAccess
};
