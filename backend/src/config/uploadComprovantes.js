const multer = require('multer');

const storage = multer.memoryStorage();
const uploadMaxMb = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10);
const uploadMaxBytes = Math.max(1, uploadMaxMb) * 1024 * 1024;

const fileFilter = (req, file, cb) => {

  const tiposPermitidos = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'text/html'
  ];

  if (tiposPermitidos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido'));
  }

};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: uploadMaxBytes
  }
});
