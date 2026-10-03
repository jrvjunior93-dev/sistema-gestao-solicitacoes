const MODES = Object.freeze(['OFF', 'PILOT', 'ENFORCED', 'PAUSED']);

function resolvePaymentQueueGate({ mode, pilotParticipant = false, internalAuthorization = false } = {}) {
  const normalized = MODES.includes(String(mode || '').toUpperCase()) ? String(mode).toUpperCase() : 'OFF';
  if (internalAuthorization) return normalized === 'PAUSED' ? 'PAUSED' : 'INTERNAL_AUTHORIZED';
  if (normalized === 'PAUSED') return 'PAUSED';
  if (normalized === 'ENFORCED') return 'AUTHORIZATION_REQUIRED';
  if (normalized === 'PILOT' && pilotParticipant) return 'AUTHORIZATION_REQUIRED';
  return 'LEGACY';
}

module.exports = { MODES, resolvePaymentQueueGate };
