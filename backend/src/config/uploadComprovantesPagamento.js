const multer = require('multer');
const path = require('path');
const createSecureUpload = require('./createSecureUpload');

const storage = multer.memoryStorage();
const uploadMaxMb = 12;

const upload = multer({
  storage,
  limits: {
    fileSize: uploadMaxMb * 1024 * 1024,
    files: 10
  },
  fileFilter(req, file, cb) {
    const extension = String(path.extname(file.originalname || '')).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();
    if (extension === '.pdf' && ['application/pdf', 'application/octet-stream', ''].includes(mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Tipo de arquivo nao permitido: envie somente comprovantes em PDF.'));
  }
});

module.exports = createSecureUpload(upload, 'documents');
