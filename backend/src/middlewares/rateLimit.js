const { getRequestIp } = require('../services/securityLogService');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const { incrementRateLimitHit } = require('../services/rateLimitStore');

function createRateLimit({
  windowMs = 60_000,
  max = 60,
  message = 'Muitas requisicoes. Tente novamente em instantes.',
  keyGenerator,
  eventType = 'RATE_LIMIT_BLOCKED',
  resource = 'ROUTE'
} = {}) {
  return async (req, res, next) => {
    try {
      const now = Date.now();
      const key = typeof keyGenerator === 'function'
        ? keyGenerator(req)
        : `${req.method}:${req.baseUrl || ''}${req.path}:${getRequestIp(req) || 'unknown'}`;

      const current = await incrementRateLimitHit(key, windowMs);

      if (Number(current?.count || 0) > max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds);
        void registrarEventoSeguranca({
          req,
          usuarioId: req.user?.id || null,
          tipoEvento: eventType,
          recursoTipo: resource,
          recursoId: req.originalUrl,
          status: 'DENIED',
          descricao: 'Requisicao bloqueada por rate limit',
          metadata: {
            chave: key,
            limite: max,
            janela_ms: windowMs,
            retry_after_seconds: retryAfterSeconds
          }
        });
        return res.status(429).json({ error: message });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createRateLimit
};
