const { createRateLimit } = require('./rateLimit');
// Autosave/conferir uma folha nao e uma tentativa de pagamento. Limite por
// identidade autenticada, agregado entre folhas (nao contornavel mudando :id).
module.exports = createRateLimit({
  windowMs: 60_000, max: 300,
  keyGenerator: req => `RH_PAGAMENTO_SAVE:${req.user?.id || 'anonimo'}`,
  message: 'Muitos salvamentos de pagamento. Aguarde um minuto; suas alteracoes permanecem no formulario.',
  eventType: 'RH_PAGAMENTO_SAVE_RATE_LIMIT', resource: 'RH_PAGAMENTO'
});
