const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { sanitizeFileNameForStorage } = require('../utils/fileName');

const INLINE_RISKY_EXTENSIONS = new Set([
  '.htm',
  '.html',
  '.js',
  '.mjs',
  '.svg',
  '.xhtml',
  '.xml'
]);

// Ambiente local/offline: sem credenciais AWS o storage remoto fica desligado.
// Evita que anexos herdados da copia do banco gerem URLs assinadas apontando
// para os buckets de producao.
function isStorageOfflineMode() {
  return !(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

let s3Client = null;

// Instanciacao preguicosa: o SDK exige region no construtor e derrubaria o boot
// do backend em ambientes sem AWS configurada.
function getS3Client() {
  if (isStorageOfflineMode()) {
    const error = new Error('Storage S3 desabilitado neste ambiente (AWS nao configurada).');
    error.code = 'STORAGE_DISABLED';
    error.statusCode = 503;
    throw error;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  return s3Client;
}

function createPresignTargetError(message) {
  const error = new Error(message);
  error.code = 'FILE_PRESIGN_INVALID_TARGET';
  error.statusCode = 400;
  return error;
}

function decodeStorageKey(rawKey) {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    const sanitizedKey = String(rawKey || '').replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    return decodeURIComponent(sanitizedKey);
  }
}

function normalizeStorageKey(rawKey, { strict = false } = {}) {
  const key = decodeStorageKey(String(rawKey || '').trim().replace(/^\/+/, ''));
  const segments = key.split('/');
  const invalid =
    !key ||
    key.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    segments.includes('..');

  if (invalid) {
    if (strict) {
      throw createPresignTargetError('Arquivo invalido para assinatura.');
    }
    return null;
  }

  return key;
}

function getAllowedStorageBuckets() {
  const configuredBuckets = [
    process.env.AWS_S3_BUCKET,
    process.env.AWS_S3_ALLOWED_BUCKETS,
    // Buckets historicos usados por ambientes que compartilham anexos antigos.
    'gestaosolicitacoes-uploads-prod',
    'fluxy-staging-jrfluxy'
  ];

  return new Set(
    configuredBuckets
      .flatMap((value) => String(value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function buildVirtualHostedS3Hosts(bucket) {
  const region = String(process.env.AWS_REGION || '').toLowerCase();
  const bucketLower = String(bucket || '').toLowerCase();

  return new Set([
    `${bucketLower}.s3.amazonaws.com`,
    region ? `${bucketLower}.s3.${region}.amazonaws.com` : null,
    region ? `${bucketLower}.s3-${region}.amazonaws.com` : null
  ].filter(Boolean));
}

function buildPathStyleS3Hosts() {
  const region = String(process.env.AWS_REGION || '').toLowerCase();
  return new Set([
    's3.amazonaws.com',
    region ? `s3.${region}.amazonaws.com` : null,
    region ? `s3-${region}.amazonaws.com` : null
  ].filter(Boolean));
}

function shouldUseLocalUploadFallback() {
  return (
    process.env.NODE_ENV !== 'production' &&
    (
      !process.env.AWS_S3_BUCKET ||
      process.env.AWS_S3_BUCKET === 'local-bucket' ||
      process.env.AWS_ACCESS_KEY_ID === 'local' ||
      process.env.AWS_SECRET_ACCESS_KEY === 'local'
    )
  );
}

async function uploadToLocal(file, folder) {
  const safeName = sanitizeFileNameForStorage(file.originalname);
  const relativeKey = `${folder}/${Date.now()}-${safeName}`.replace(/\\/g, '/');
  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
  const absolutePath = path.join(uploadsDir, ...relativeKey.split('/'));

  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, file.buffer);

  return `/uploads/${relativeKey}`;
}

async function uploadToS3(file, folder) {
  if (shouldUseLocalUploadFallback()) {
    return uploadToLocal(file, folder);
  }

  const safeName = sanitizeFileNameForStorage(file.originalname);
  const key = normalizeStorageKey(`${folder}/${Date.now()}-${safeName}`, { strict: true });
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  });

  await getS3Client().send(command);

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${command.input.Key}`;
}

async function copyStorageObject(urlOrKey, destinationFolder) {
  if (!urlOrKey) throw createPresignTargetError('Arquivo de origem ausente.');
  const safeFolder = normalizeStorageKey(destinationFolder, { strict: true });
  const sourceName = sanitizeFileNameForStorage(path.basename(String(urlOrKey).split('?')[0]) || 'documento');
  const destinationName = `${Date.now()}-${crypto.randomUUID()}-${sourceName}`;

  if (String(urlOrKey).startsWith('/uploads/')) {
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    const sourceKey = normalizeStorageKey(String(urlOrKey).replace(/^\/uploads\//, ''), { strict: true });
    const sourcePath = path.resolve(uploadsDir, ...sourceKey.split('/'));
    const destinationKey = normalizeStorageKey(`${safeFolder}/${destinationName}`, { strict: true });
    const destinationPath = path.resolve(uploadsDir, ...destinationKey.split('/'));
    if (!sourcePath.startsWith(`${uploadsDir}${path.sep}`) || !destinationPath.startsWith(`${uploadsDir}${path.sep}`)) throw createPresignTargetError('Arquivo local fora do storage permitido.');
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.copyFile(sourcePath, destinationPath);
    return `/uploads/${destinationKey}`;
  }

  const source = getStorageTarget(urlOrKey, { strict: true });
  const targetBucket = process.env.AWS_S3_BUCKET;
  if (!targetBucket) throw createPresignTargetError('Bucket de destino nao configurado.');
  const destinationKey = normalizeStorageKey(`${safeFolder}/${destinationName}`, { strict: true });
  await getS3Client().send(new CopyObjectCommand({
    Bucket: targetBucket,
    Key: destinationKey,
    CopySource: encodeURI(`${source.bucket}/${source.key}`).replace(/#/g, '%23')
  }));
  return `https://${targetBucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${destinationKey}`;
}

function getStorageTargetFromUrl(url, { strict = false } = {}) {
  try {
    const parsed = new URL(url);
    const allowedBuckets = getAllowedStorageBuckets();

    if (!allowedBuckets.size || !['http:', 'https:'].includes(parsed.protocol)) {
      if (strict) throw createPresignTargetError('Arquivo fora do storage configurado.');
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();

    for (const bucket of allowedBuckets) {
      const bucketLower = String(bucket).toLowerCase();
      const virtualHostedHosts = buildVirtualHostedS3Hosts(bucket);
      if (virtualHostedHosts.has(hostname) || hostname.startsWith(`${bucketLower}.s3`)) {
        return {
          bucket,
          key: normalizeStorageKey(parsed.pathname.replace(/^\//, ''), { strict })
        };
      }
    }

    const pathStyleHosts = buildPathStyleS3Hosts();
    if (pathStyleHosts.has(hostname)) {
      const parts = parsed.pathname.replace(/^\//, '').split('/');
      const pathBucket = parts.shift();
      const matchedBucket = Array.from(allowedBuckets).find(
        (bucket) => String(bucket).toLowerCase() === String(pathBucket || '').toLowerCase()
      );
      if (matchedBucket) {
        return {
          bucket: matchedBucket,
          key: normalizeStorageKey(parts.join('/'), { strict })
        };
      }
    }
  } catch (error) {
    if (strict && error?.code === 'FILE_PRESIGN_INVALID_TARGET') {
      throw error;
    }
  }

  if (strict) {
    throw createPresignTargetError('Arquivo fora do storage configurado.');
  }

  return null;
}

function getStorageTarget(urlOrKey, { strict = false } = {}) {
  const target = String(urlOrKey || '').trim();
  if (!target) {
    if (strict) throw createPresignTargetError('Arquivo invalido para assinatura.');
    return null;
  }

  if (/^https?:\/\//i.test(target)) {
    return getStorageTargetFromUrl(target, { strict });
  }

  const key = normalizeStorageKey(target, { strict });
  if (!key) return null;

  return {
    bucket: process.env.AWS_S3_BUCKET,
    key
  };
}

function shouldForceAttachmentForTarget(target) {
  const extension = String(path.extname(String(target || '').split('?')[0]) || '').toLowerCase();
  return INLINE_RISKY_EXTENSIONS.has(extension);
}

async function getPresignedUrl(urlOrKey, expiresIn = 300, options = {}) {
  if (!urlOrKey) return urlOrKey;
  if (String(urlOrKey).startsWith('/uploads/')) {
    return urlOrKey;
  }

  // Sem AWS configurada nao ha o que assinar: devolve o valor original em vez de
  // emitir uma URL para o bucket de producao.
  if (isStorageOfflineMode()) {
    return urlOrKey;
  }

  const storageTarget = getStorageTarget(urlOrKey, options);

  if (!storageTarget?.key) {
    if (options.strict) {
      throw createPresignTargetError('Arquivo invalido para assinatura.');
    }
    return urlOrKey;
  }

  const { key } = storageTarget;
  const riskyInlineTarget = shouldForceAttachmentForTarget(key);

  const command = new GetObjectCommand({
    Bucket: storageTarget.bucket || process.env.AWS_S3_BUCKET,
    Key: key,
    ...(riskyInlineTarget
      ? {
          ResponseContentDisposition: `attachment; filename="${sanitizeFileNameForStorage(path.basename(key))}"`,
          ResponseContentType: 'application/octet-stream'
        }
      : {})
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

module.exports = { uploadToS3, copyStorageObject, getPresignedUrl, shouldForceAttachmentForTarget, isStorageOfflineMode };
