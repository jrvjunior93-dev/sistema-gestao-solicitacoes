const multer = require('multer');
const path = require('path');
const createSecureUpload = require('./createSecureUpload');
const { identificarComprovanteFila } = require('../services/comprovanteFilaArquivoDomain');

const storage = multer.memoryStorage();
const uploadMaxMb = 12;

function criarUpload(manual = false) { return multer({
  storage,
  limits: {
    fileSize: uploadMaxMb * 1024 * 1024,
    files: 10
  },
  fileFilter(req, file, cb) {
    if (manual) {
      try { identificarComprovanteFila(file); return cb(null, true); }
      catch (error) { return cb(error); }
    }
    const extension = String(path.extname(file.originalname || '')).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();
    if (extension === '.pdf' && ['application/pdf', 'application/octet-stream', ''].includes(mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Tipo de arquivo nao permitido: envie somente comprovantes em PDF.'));
  }
}); }

// Exportacao padrao permanece exclusivamente PDF para leitura/importacao.
module.exports = createSecureUpload(criarUpload(), 'documents');
module.exports.manual = createSecureUpload(criarUpload(true), 'documents');
