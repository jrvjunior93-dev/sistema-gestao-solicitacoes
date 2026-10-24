'use strict';

const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { attachmentContentDisposition } = require('../../../utils/fileName');

const ALLOWED_FISCAL_MIME_TYPES = new Set([
  'application/xml',
  'text/xml',
  'application/pdf',
  'application/zip',
  'application/json',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png'
]);

function normalizePrefix(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function sanitizePathSegment(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/g, '');

  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Segmento de caminho fiscal invalido.');
  }

  return normalized;
}

function sanitizeMetadataValue(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._=-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 255);
}

function getFiscalS3Config() {
  return {
    bucket: process.env.FISCAL_S3_BUCKET || null,
    region: process.env.FISCAL_S3_REGION || process.env.AWS_REGION || null,
    prefix: normalizePrefix(process.env.FISCAL_S3_PREFIX || process.env.FISCAL_ENV || 'dev'),
    presignedExpiresSeconds: Number(process.env.FISCAL_S3_PRESIGNED_EXPIRES_SECONDS || 300)
  };
}

function createFiscalS3Client() {
  const config = getFiscalS3Config();
  const clientConfig = {
    region: config.region
  };

  if (process.env.FISCAL_S3_ROLE_ARN) {
    // Opt-in exclusivo do fiscal PROD. Sem fallback para a credencial de origem
    // se STS/role falhar; demais clientes AWS/ambientes permanecem inalterados.
    clientConfig.credentials = require('./fiscalProdS3Role').createCredentialsProvider(config);
    clientConfig.endpoint = 'https://s3.us-east-2.amazonaws.com';
  } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
  }

  return new S3Client(clientConfig);
}

function isFiscalS3Configured() {
  const config = getFiscalS3Config();
  return Boolean(config.bucket && config.region);
}

function assertFiscalS3Configured() {
  if (!isFiscalS3Configured()) {
    const error = new Error('Storage fiscal nao configurado. Informe FISCAL_S3_BUCKET e FISCAL_S3_REGION.');
    error.statusCode = 400;
    throw error;
  }
}

function validateFiscalMimeType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_FISCAL_MIME_TYPES.has(normalized)) {
    const error = new Error('Tipo de arquivo fiscal nao permitido.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function buildFiscalObjectKey({
  cnpj,
  documentType = 'nfe',
  accessKey,
  folder = 'xml',
  filename = 'original.xml',
  date = new Date()
}) {
  const config = getFiscalS3Config();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const parts = [
    config.prefix,
    sanitizePathSegment(cnpj),
    sanitizePathSegment(documentType),
    year,
    month,
    sanitizePathSegment(accessKey),
    sanitizePathSegment(folder),
    sanitizePathSegment(filename)
  ].filter(Boolean);

  return parts.join('/');
}

function buildFiscalAccountingBatchObjectKey({
  cnpj,
  referenceYear,
  referenceMonth,
  batchId,
  filename
}) {
  const config = getFiscalS3Config();
  const parts = [
    config.prefix,
    sanitizePathSegment(cnpj),
    'accounting-batches',
    sanitizePathSegment(referenceYear),
    sanitizePathSegment(String(referenceMonth).padStart(2, '0')),
    `lote-${sanitizePathSegment(batchId)}`,
    sanitizePathSegment(filename)
  ].filter(Boolean);

  return parts.join('/');
}

function buildFiscalRawSefazObjectKey({
  cnpj,
  syncLogId = 'manual',
  direction = 'response',
  requestType = 'distNSU',
  extension = 'xml',
  date = new Date()
}) {
  const config = getFiscalS3Config();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const parts = [
    config.prefix,
    sanitizePathSegment(cnpj),
    'raw',
    'sefaz',
    year,
    month,
    day,
    sanitizePathSegment(syncLogId),
    `${sanitizePathSegment(direction)}-${sanitizePathSegment(requestType)}.${sanitizePathSegment(extension)}`
  ].filter(Boolean);

  return parts.join('/');
}

function calculateSha256(bufferOrString) {
  return crypto
    .createHash('sha256')
    .update(bufferOrString)
    .digest('hex');
}

async function uploadFiscalObject({ key, body, contentType, metadata = {} }) {
  assertFiscalS3Configured();
  if (!key || String(key).includes('..') || path.isAbsolute(String(key))) {
    const error = new Error('Chave de storage fiscal invalida.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedContentType = validateFiscalMimeType(contentType);
  const config = getFiscalS3Config();
  const client = createFiscalS3Client();
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  const hash = calculateSha256(buffer);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: normalizedContentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      ...Object.fromEntries(
        Object.entries(metadata || {}).map(([itemKey, value]) => [
          sanitizePathSegment(itemKey).toLowerCase(),
          sanitizeMetadataValue(value)
        ])
      ),
      sha256: hash
    }
  }));

  return {
    bucket: config.bucket,
    key,
    hash,
    contentType: normalizedContentType
  };
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function getFiscalObjectBuffer(key) {
  assertFiscalS3Configured();
  const config = getFiscalS3Config();
  const client = createFiscalS3Client();

  if (!key || String(key).includes('..') || path.isAbsolute(String(key))) {
    const error = new Error('Chave de storage fiscal invalida.');
    error.statusCode = 400;
    throw error;
  }

  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key
  }));

  return streamToBuffer(response.Body);
}

async function saveFiscalXml({ cnpj, documentType = 'nfe', accessKey, xml, date = new Date(), metadata = {} }) {
  const key = buildFiscalObjectKey({
    cnpj,
    documentType,
    accessKey,
    folder: 'xml',
    filename: 'original.xml',
    date
  });

  return uploadFiscalObject({
    key,
    body: xml,
    contentType: 'application/xml',
    metadata
  });
}

async function saveRawSefazPayload({
  cnpj,
  syncLogId = 'manual',
  direction = 'response',
  requestType = 'distNSU',
  payload,
  contentType = 'application/xml',
  date = new Date(),
  metadata = {}
}) {
  const key = buildFiscalRawSefazObjectKey({
    cnpj,
    syncLogId,
    direction,
    requestType,
    extension: contentType === 'application/json' ? 'json' : 'xml',
    date
  });

  return uploadFiscalObject({
    key,
    body: payload,
    contentType,
    metadata: {
      ...metadata,
      fiscal_payload: 'raw_sefaz',
      direction,
      request_type: requestType
    }
  });
}

async function saveRawSefazRequest(options = {}) {
  return saveRawSefazPayload({
    ...options,
    direction: 'request'
  });
}

async function saveRawSefazResponse(options = {}) {
  return saveRawSefazPayload({
    ...options,
    direction: 'response'
  });
}

async function getFiscalObjectSignedUrl(key, expiresIn = null, options = {}) {
  assertFiscalS3Configured();
  const config = getFiscalS3Config();
  const client = createFiscalS3Client();
  const safeExpires = Number(expiresIn || config.presignedExpiresSeconds || 300);

  if (!key || String(key).includes('..') || path.isAbsolute(String(key))) {
    const error = new Error('Chave de storage fiscal invalida.');
    error.statusCode = 400;
    throw error;
  }

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ...(options.attachment ? { ResponseContentDisposition: attachmentContentDisposition(options.filename || 'documento.xml') } : {}),
    ...(options.contentType ? { ResponseContentType: options.contentType } : {})
  });

  return getSignedUrl(client, command, { expiresIn: Math.min(Math.max(safeExpires, 60), 900) });
}

module.exports = {
  assertFiscalS3Configured,
  buildFiscalAccountingBatchObjectKey,
  buildFiscalObjectKey,
  buildFiscalRawSefazObjectKey,
  calculateSha256,
  getFiscalObjectBuffer,
  getFiscalS3Config,
  getFiscalObjectSignedUrl,
  isFiscalS3Configured,
  saveRawSefazPayload,
  saveRawSefazRequest,
  saveRawSefazResponse,
  saveFiscalXml,
  uploadFiscalObject,
  validateFiscalMimeType
};
