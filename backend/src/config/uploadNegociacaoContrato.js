const multer = require('multer');
const path = require('path');
const createSecureUpload = require('./createSecureUpload');
const { UploadSecurityError } = require('../services/uploadSecurityErrors');

/**
 * Upload do documento de NEGOCIACAO DETALHADA do contrato (20/08).
 *
 * Perfil proprio, e nao o `documents` geral, porque a lista de tipos aqui e curta de proposito:
 * este slot recebe UM documento de negociacao. O perfil geral aceita `.rar`, `.csv`, `.xls`,
 * imagens — superficie que este campo nao precisa e que so amplia o que pode chegar ao servidor.
 *
 * O `.rar` merece nota: no perfil geral ele passa com validacao de assinatura, mas o conteudo
 * DENTRO do arquivo compactado nao e inspecionado por nenhuma das checagens de estrutura. Aqui ele
 * simplesmente nao entra.
 *
 * A checagem de macro e de objeto embutido vem do `uploadFileSecurity` (perfil
 * `contrato_negociacao`), junto com a varredura antivirus quando `CLAMAV_ENABLED` estiver ligado.
 */

const storage = multer.memoryStorage();

// Documento de negociacao nao e midia: 20 MB e folgado para um docx ou pdf com anexos.
const uploadMaxMb = Number(process.env.UPLOAD_NEGOCIACAO_MAX_MB || 20);
const uploadMaxBytes = Math.max(1, uploadMaxMb) * 1024 * 1024;

const tiposPermitidos = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const extensoesPermitidas = new Set(['.pdf', '.docx']);

const fileFilter = (req, file, cb) => {
  const extensaoArquivo = String(path.extname(file.originalname || '') || '').toLowerCase();
  const mimeNormalizado = String(file.mimetype || '').toLowerCase();

  // `application/octet-stream` e aceito porque navegador e sistema operacional as vezes nao sabem
  // o tipo — mas a extensao continua obrigatoria, e a estrutura do arquivo e conferida depois.
  const mimePermitido =
    !mimeNormalizado ||
    mimeNormalizado === 'application/octet-stream' ||
    tiposPermitidos.has(mimeNormalizado);

  if (mimePermitido && extensoesPermitidas.has(extensaoArquivo)) {
    cb(null, true);
    return;
  }

  // `UploadSecurityError`, e nao `Error` puro: erro sem `statusCode` sai do multer como **500
  // "Erro interno do servidor"**, e quem escolheu o arquivo errado leria isso como sistema
  // quebrado em vez de arquivo recusado. A recusa precisa se parecer com recusa.
  cb(new UploadSecurityError('Envie a negociacao detalhada em .docx ou .pdf.', 400, 'UPLOAD_EXTENSION_UNSUPPORTED'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: uploadMaxBytes,
    files: 1
  }
});

module.exports = createSecureUpload(upload, 'contrato_negociacao');
