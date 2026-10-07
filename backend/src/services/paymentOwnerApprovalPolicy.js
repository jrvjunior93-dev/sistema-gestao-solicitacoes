const MODES = Object.freeze(['OFF', 'PILOT', 'ENFORCED', 'PAUSED']);

function resolvePaymentQueueGate({ mode, pilotParticipant = false, internalAuthorization = false, directQueuePermission = false } = {}) {
  const normalized = MODES.includes(String(mode || '').toUpperCase()) ? String(mode).toUpperCase() : 'OFF';
  if (internalAuthorization) return normalized === 'PAUSED' ? 'PAUSED' : 'INTERNAL_AUTHORIZED';
  // A permissao de fila e independente de preparar autorizacao. Esta flag e
  // calculada no backend, nunca aceita no payload nem derivada de um status.
  if (directQueuePermission) return 'MANUAL_QUEUE_ALLOWED';
  if (normalized === 'PAUSED') return 'PAUSED';
  if (normalized === 'ENFORCED') return 'AUTHORIZATION_REQUIRED';
  if (normalized === 'PILOT' && pilotParticipant) return 'AUTHORIZATION_REQUIRED';
  return 'LEGACY';
}

module.exports = { MODES, resolvePaymentQueueGate };
