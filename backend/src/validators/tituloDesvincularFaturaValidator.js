'use strict';
const { ensureAllowedKeys, sanitizeString, ValidationError } = require('../middlewares/validation');

function validateTituloDesvincularFaturaBody(body) {
  ensureAllowedKeys(body, ['motivo', 'idempotency_key', 'fatura_cartao_id'], 'Desvinculacao de fatura');
  const motivo = sanitizeString(body.motivo, 'Motivo', { required: true, max: 1000 });
  if (motivo.length < 3) throw new ValidationError('Informe um motivo com pelo menos 3 caracteres.');
  const idempotency_key = sanitizeString(body.idempotency_key, 'Chave da operacao', {
    required: true, max: 100, pattern: /^[a-zA-Z0-9_-]{16,100}$/
  });
  if (!/^\d+$/.test(String(body.fatura_cartao_id || '')) || !Number.isSafeInteger(Number(body.fatura_cartao_id))
    || Number(body.fatura_cartao_id) <= 0) throw new ValidationError('Fatura prevista invalida. Atualize o titulo.');
  return { motivo, idempotency_key, fatura_cartao_id: Number(body.fatura_cartao_id) };
}
module.exports = { validateTituloDesvincularFaturaBody };
