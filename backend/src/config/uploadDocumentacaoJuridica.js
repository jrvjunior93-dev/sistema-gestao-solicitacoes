const multer = require('multer');
const path = require('path');
const createSecureUpload = require('./createSecureUpload');
const { UploadSecurityError } = require('../services/uploadSecurityErrors');

const storage = multer.memoryStorage();
const uploadMaxMb = Number(process.env.UPLOAD_DOCUMENTACAO_JURIDICA_MAX_MB || 20);
const uploadMaxBytes = Math.max(1, uploadMaxMb) * 1024 * 1024;

const tiposPermitidos = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg'
]);
const extensoesPermitidas = new Set(['.pdf', '.docx', '.png', '.jpg', '.jpeg']);

const fileFilter = (req, file, cb) => {
  const extensao = String(path.extname(file.originalname || '') || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const mimePermitido = !mime || mime === 'application/octet-stream' || tiposPermitidos.has(mime);

  if (mimePermitido && extensoesPermitidas.has(extensao)) {
    cb(null, true);
    return;
  }

  cb(new UploadSecurityError(
    'Envie o documento em PDF, DOCX, JPG ou PNG.',
    400,
    'UPLOAD_EXTENSION_UNSUPPORTED'
  ));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: uploadMaxBytes, files: 1 }
});

// O filtro acima e mais estreito; o perfil `documents` faz a validacao binaria e bloqueia macros.
module.exports = createSecureUpload(upload, 'documents');
