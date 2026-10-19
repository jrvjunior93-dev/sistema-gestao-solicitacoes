'use strict';
const { ensureAllowedKeys, sanitizeString, ValidationError } = require('../middlewares/validation');
function validateTituloCancelamentoBody(body) {
  ensureAllowedKeys(body, ['motivo', 'idempotency_key', 'versao'], 'Cancelamento de titulo');
  if (['motivo', 'idempotency_key', 'versao'].some(key => typeof body[key] !== 'string')) {
    throw new ValidationError('Informe motivo, chave e versao como texto.');
  }
  const motivo = sanitizeString(body.motivo, 'Motivo', { required: true, max: 1000 });
  if (motivo.length < 3) throw new ValidationError('Informe um motivo com pelo menos 3 caracteres.');
  const idempotency_key = sanitizeString(body.idempotency_key, 'Chave da operacao', {
    required: true, max: 100, pattern: /^[a-zA-Z0-9_-]{16,100}$/
  });
  const versao = sanitizeString(body.versao, 'Versao do titulo', { required: true, max: 30 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(versao)
    || !Number.isFinite(Date.parse(versao)) || new Date(versao).toISOString() !== versao) {
    throw new ValidationError('Versao do titulo invalida. Atualize a consulta.');
  }
  return { motivo, idempotency_key, versao };
}
module.exports = { validateTituloCancelamentoBody };
