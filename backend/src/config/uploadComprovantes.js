const multer = require('multer');
const path = require('path');
const fs = require('fs');

const baseDir = path.resolve(__dirname, '../../uploads/comprovantes');

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    cb(null, baseDir);
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }

});

const fileFilter = (req, file, cb) => {

  const tiposPermitidos = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
  fileFilter
});
