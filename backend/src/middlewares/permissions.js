const {
  hasAnyProfile,
  hasAnyScopeToken,
  hasObraAccess
} = require('../services/authorizationService');
const { registrarEventoSeguranca } = require('../services/securityLogService');

module.exports = function permit(config = []) {
  const options = Array.isArray(config) ? { profiles: config } : (config || {});

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario nao autenticado' });
    }

    // SUPERADMIN possui acesso funcional global. As validacoes de existencia,
    // consistencia e transicao de estado continuam sendo feitas pelos services.
    if (hasAnyProfile(req.user, ['SUPERADMIN'])) {
      return next();
    }

    if (Array.isArray(options.profiles) && options.profiles.length > 0) {
      if (!hasAnyProfile(req.user, options.profiles)) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user.id,
          tipoEvento: 'AUTHZ_DENIED',
          recursoTipo: options.resource || 'ROUTE',
          recursoId: req.originalUrl,
          status: 'DENIED',
          descricao: 'Perfil sem permissao para acessar o recurso',
          metadata: {
            perfis_requeridos: options.profiles
          }
        });
        return res.status(403).json({ error: 'Acesso negado para este perfil' });
      }
    }

    if (Array.isArray(options.scopeTokens) && options.scopeTokens.length > 0) {
      const allowed = await hasAnyScopeToken(req.user, options.scopeTokens);
      if (!allowed) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user.id,
          tipoEvento: 'AUTHZ_DENIED',
          recursoTipo: options.resource || 'ROUTE',
          recursoId: req.originalUrl,
          status: 'DENIED',
          descricao: 'Escopo sem permissao para acessar o recurso',
          metadata: {
            tokens_requeridos: options.scopeTokens
          }
        });
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    if (options.requireObraAccess) {
      const obraId = typeof options.resolveObraId === 'function'
        ? await options.resolveObraId(req)
        : req.params?.obraId || req.params?.obra_id || req.body?.obra_id || req.query?.obra_id;

      const allowed = await hasObraAccess(req.user, obraId);
      if (!allowed) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user.id,
          tipoEvento: 'AUTHZ_DENIED',
          recursoTipo: options.resource || 'ROUTE',
          recursoId: obraId != null ? String(obraId) : req.originalUrl,
          status: 'DENIED',
          descricao: 'Usuario sem acesso a obra do recurso',
          metadata: {
            obra_id: obraId
          }
        });
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }
    }

    if (typeof options.custom === 'function') {
      const result = await options.custom(req);
      if (result !== true) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user.id,
          tipoEvento: 'AUTHZ_DENIED',
          recursoTipo: options.resource || 'ROUTE',
          recursoId: req.originalUrl,
          status: 'DENIED',
          descricao: typeof result === 'string' ? result : 'Regra customizada de autorizacao bloqueou o acesso'
        });
        return res.status(403).json({
          error: typeof result === 'string' ? result : 'Acesso negado'
        });
      }
    }

    return next();
  };
};
