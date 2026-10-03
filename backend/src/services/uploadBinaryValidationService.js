const path = require('path');
const { UploadSecurityError } = require('./uploadSecurityErrors');

const PDF_SIGNATURE = Buffer.from('%PDF-');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];
const RAR_SIGNATURES = [
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]),
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
];
const WEBM_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const allowedProfiles = {
  documents: new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.png',
    '.jpg',
    '.jpeg',
    '.rar'
  ]),
  // Negociacao detalhada do contrato acima do limite: so o documento em si.
  contrato_negociacao: new Set(['.docx', '.pdf']),
  ofx: new Set(['.ofx']),
  fiscal_file: new Set(['.pdf', '.png', '.jpg', '.jpeg']),
  fiscal_xml: new Set(['.xml', '.zip']),
  training_media: new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.png',
    '.jpg',
    '.jpeg',
    '.mp4',
    '.webm'
  ])
};

function bufferStartsWith(buffer, signature) {
  return Buffer.isBuffer(buffer) && buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function hasZipSignature(buffer) {
  return ZIP_SIGNATURES.some((signature) => bufferStartsWith(buffer, signature));
}

function hasRarSignature(buffer) {
  return RAR_SIGNATURES.some((signature) => bufferStartsWith(buffer, signature));
}

function hasPrintableText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let printableChars = 0;

  for (const byte of sample) {
    if (byte === 0x00) {
      return false;
    }

    const isWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isPrintable = byte >= 0x20 && byte <= 0x7e;
    const isUtf8Extended = byte >= 0xc0;

    if (isWhitespace || isPrintable || isUtf8Extended) {
      printableChars += 1;
    }
  }

  return printableChars / sample.length >= 0.9;
}

function containsTextFragment(buffer, fragment) {
  return buffer.toString('utf8', 0, Math.min(buffer.length, 64 * 1024)).includes(fragment);
}

/**
 * Marcadores de macro e de objeto embutido dentro de um pacote Office Open XML.
 *
 * A busca e por NOME DE ENTRADA do ZIP, e isso e deliberado: os nomes ficam em claro nos cabecalhos
 * locais e no diretorio central, enquanto o CONTEUDO das entradas (inclusive o
 * `[Content_Types].xml`, que declararia o content-type de macro) esta comprimido com DEFLATE.
 * Procurar pela string `macroEnabled` nao acharia nada num arquivo real.
 *
 * Um `.docm` renomeado para `.docx` cai aqui pelo mesmo motivo: todo `.docm` carrega
 * `word/vbaProject.bin`.
 */
const MARCADORES_MACRO = [
  Buffer.from('vbaProject.bin'),
  Buffer.from('vbaData.xml'),
  Buffer.from('macroEnabled')
];

const MARCADORES_OBJETO_EMBUTIDO = [
  Buffer.from('oleObject'),
  Buffer.from('embeddings/')
];

function contemMarcador(buffer, marcadores) {
  // `Buffer.includes` varre o buffer INTEIRO em codigo nativo. A checagem de estrutura abaixo olha
  // so os primeiros 512 KB; se a deteccao de macro fizesse o mesmo, bastaria empurrar o
  // `vbaProject.bin` para depois desse ponto para escapar dela.
  return Buffer.isBuffer(buffer) && marcadores.some((marcador) => buffer.includes(marcador));
}

function assertSemMacroOuObjetoEmbutido(buffer) {
  if (contemMarcador(buffer, MARCADORES_MACRO)) {
    throw new UploadSecurityError(
      'Arquivo com macro nao e aceito. Salve o documento sem macros (.docx) e envie novamente.',
      400,
      'UPLOAD_MACRO_BLOCKED'
    );
  }

  if (contemMarcador(buffer, MARCADORES_OBJETO_EMBUTIDO)) {
    throw new UploadSecurityError(
      'Arquivo com objeto embutido nao e aceito. Remova anexos incorporados ao documento e envie novamente.',
      400,
      'UPLOAD_EMBEDDED_OBJECT_BLOCKED'
    );
  }
}

function assertOfficeOpenXml(buffer, extension) {
  if (!hasZipSignature(buffer)) {
    throw new UploadSecurityError('Conteudo do arquivo nao corresponde ao tipo informado.', 400, 'UPLOAD_BINARY_MISMATCH');
  }

  const body = buffer.toString('latin1', 0, Math.min(buffer.length, 512 * 1024));
  const requiredEntries = {
    '.docx': ['[Content_Types].xml', 'word/'],
    '.xlsx': ['[Content_Types].xml', 'xl/'],
    '.pptx': ['[Content_Types].xml', 'ppt/']
  };

  const matches = requiredEntries[extension] || [];
  if (!matches.every((fragment) => body.includes(fragment))) {
    throw new UploadSecurityError('Arquivo Office invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
  }

  // Vale para TODO Office Open XML do sistema, nao so para o anexo do contrato: um .docx com macro
  // era aceito em qualquer upload ate aqui.
  assertSemMacroOuObjetoEmbutido(buffer);
}

function assertDocumentBinary(file) {
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();
  const buffer = file?.buffer;

  switch (extension) {
    case '.pdf':
      if (!bufferStartsWith(buffer, PDF_SIGNATURE)) {
        throw new UploadSecurityError('PDF invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    case '.png':
      if (!bufferStartsWith(buffer, PNG_SIGNATURE)) {
        throw new UploadSecurityError('Imagem PNG invalida ou corrompida.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    case '.jpg':
    case '.jpeg':
      if (!bufferStartsWith(buffer, JPEG_SIGNATURE)) {
        throw new UploadSecurityError('Imagem JPEG invalida ou corrompida.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    case '.doc':
    case '.xls':
    case '.ppt':
      if (!bufferStartsWith(buffer, OLE_SIGNATURE)) {
        throw new UploadSecurityError('Documento Office invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    case '.docx':
    case '.xlsx':
    case '.pptx':
      assertOfficeOpenXml(buffer, extension);
      return;
    case '.csv':
      if (!hasPrintableText(buffer)) {
        throw new UploadSecurityError('CSV invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    case '.rar':
      if (!hasRarSignature(buffer)) {
        throw new UploadSecurityError('Arquivo RAR invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
      }
      return;
    default:
      throw new UploadSecurityError('Extensao de arquivo nao suportada para validacao.', 400, 'UPLOAD_EXTENSION_UNSUPPORTED');
  }
}

function assertOfxBinary(file) {
  const buffer = file?.buffer;
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();

  if (extension !== '.ofx') {
    throw new UploadSecurityError('Extensao de arquivo nao permitida.', 400, 'UPLOAD_EXTENSION_UNSUPPORTED');
  }

  if (!hasPrintableText(buffer)) {
    throw new UploadSecurityError('Arquivo OFX invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
  }

  const body = buffer.toString('utf8', 0, Math.min(buffer.length, 64 * 1024)).toUpperCase();
  const matchesOfx = body.includes('OFXHEADER:') || body.includes('<OFX>');
  if (!matchesOfx) {
    throw new UploadSecurityError('Arquivo OFX invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
  }
}

function assertFiscalXmlBinary(file) {
  const buffer = file?.buffer;
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();

  if (!['.xml', '.zip'].includes(extension)) {
    throw new UploadSecurityError('Extensao de arquivo fiscal nao permitida.', 400, 'UPLOAD_EXTENSION_UNSUPPORTED');
  }

  if (extension === '.zip') {
    if (!hasZipSignature(buffer)) {
      throw new UploadSecurityError('ZIP fiscal invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
    }
    return;
  }

  if (!hasPrintableText(buffer)) {
    throw new UploadSecurityError('XML fiscal invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
  }

  const body = buffer.toString('utf8', 0, Math.min(buffer.length, 256 * 1024)).toLowerCase();
  const looksLikeFiscalXml =
    body.includes('<nfeproc') ||
    body.includes('<nfe ') ||
    body.includes('<nfe>') ||
    body.includes('<chave') ||
    body.includes('<chnfe') ||
    body.includes('infnfe');

  if (!looksLikeFiscalXml) {
    throw new UploadSecurityError('XML fiscal nao identificado como NFe.', 400, 'UPLOAD_BINARY_MISMATCH');
  }
}

function assertTrainingMediaBinary(file) {
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();
  const buffer = file?.buffer;

  if (extension === '.mp4') {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length < 12 ||
      buffer.toString('latin1', 4, 8) !== 'ftyp'
    ) {
      throw new UploadSecurityError('Video MP4 invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
    }
    return;
  }

  if (extension === '.webm') {
    if (!bufferStartsWith(buffer, WEBM_SIGNATURE)) {
      throw new UploadSecurityError('Video WebM invalido ou corrompido.', 400, 'UPLOAD_BINARY_MISMATCH');
    }
    return;
  }

  assertDocumentBinary(file);
}

function assertProfileAllowed(profile, file) {
  const extension = String(path.extname(file?.originalname || '') || '').toLowerCase();
  const allowedExtensions = allowedProfiles[profile] || allowedProfiles.documents;

  if (!allowedExtensions.has(extension)) {
    throw new UploadSecurityError('Extensao de arquivo nao permitida.', 400, 'UPLOAD_EXTENSION_UNSUPPORTED');
  }
}

function assertFileBinaryMatchesProfile(file, profile = 'documents') {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new UploadSecurityError('Arquivo vazio ou invalido.', 400, 'UPLOAD_EMPTY_FILE');
  }

  assertProfileAllowed(profile, file);

  if (profile === 'ofx') {
    assertOfxBinary(file);
    return;
  }

  if (profile === 'fiscal_xml') {
    assertFiscalXmlBinary(file);
    return;
  }

  if (profile === 'training_media') {
    assertTrainingMediaBinary(file);
    return;
  }

  if (profile === 'fiscal_file') {
    assertDocumentBinary(file);
    return;
  }

  assertDocumentBinary(file);
}

function flattenUploadedFiles(req) {
  if (req?.file) {
    return [req.file];
  }

  if (Array.isArray(req?.files)) {
    return req.files.filter(Boolean);
  }

  if (req?.files && typeof req.files === 'object') {
    return Object.values(req.files)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean);
  }

  return [];
}

module.exports = {
  assertFileBinaryMatchesProfile,
  containsTextFragment,
  flattenUploadedFiles
};
