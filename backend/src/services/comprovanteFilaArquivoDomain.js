'use strict';
const path = require('node:path');
const { assertFileBinaryMatchesProfile } = require('./uploadBinaryValidationService');
const LIMITE_BYTES = 12 * 1024 * 1024;
const FORMATOS = {
  '.pdf': { tipo: 'PDF', mime: 'application/pdf' },
  '.jpg': { tipo: 'JPEG', mime: 'image/jpeg' },
  '.jpeg': { tipo: 'JPEG', mime: 'image/jpeg' },
  '.png': { tipo: 'PNG', mime: 'image/png' }
};
function falhar(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function identificarComprovanteFila(file) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  const formato = FORMATOS[extension];
  const mime = String(file?.mimetype || '').toLowerCase();
  if (!formato || !['', 'application/octet-stream', formato.mime].includes(mime)) {
    falhar('Tipo de arquivo nao permitido: envie PDF, JPG, JPEG ou PNG.');
  }
  return formato;
}
function validarComprovanteFila(file) {
  const formato = identificarComprovanteFila(file);
  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) falhar('Selecione um comprovante valido em PDF, JPG, JPEG ou PNG.');
  if (file.buffer.length > LIMITE_BYTES) falhar('O comprovante excede o limite de 12 MB.');
  // Reutiliza as assinaturas atuais. Nao basta renomear a extensao ou o MIME.
  assertFileBinaryMatchesProfile(file, 'documents');
  return formato;
}
module.exports = { identificarComprovanteFila, validarComprovanteFila, LIMITE_BYTES };
