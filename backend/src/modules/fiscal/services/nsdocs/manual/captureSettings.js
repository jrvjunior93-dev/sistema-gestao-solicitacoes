'use strict';
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { PRIVATE_DIR, check } = require('./policy');
const store = require('./privateStore');
const FILE = `${PRIVATE_DIR}/capture-config.json`;
const SETTINGS = Object.freeze({
  NSDOCS_DEV_S3_BUCKET: 'fluxy-fiscal-dev', NSDOCS_PROD_S3_BUCKET: 'fluxy-fiscal-prod',
  NSDOCS_DEV_S3_OWNER: '992500432025',
  NSDOCS_DEV_S3_ROLE_ARN: 'arn:aws:iam::992500432025:role/FluxyNsdocsFiscalDev'
});
function fiscalAlignment(env) {
  // Mesma precedencia/defaults do getFiscalS3Config existente, sem muda-los.
  const region = env.FISCAL_S3_REGION || env.AWS_REGION || null;
  const prefix = String(env.FISCAL_S3_PREFIX || env.FISCAL_ENV || 'dev').trim().replace(/^\/+|\/+$/g, '');
  return { bucket_fiscal_dev_alinhado: env.FISCAL_S3_BUCKET === SETTINGS.NSDOCS_DEV_S3_BUCKET,
    regiao_fiscal_alinhada: region === 'us-east-2', prefixo_fiscal_alinhado: prefix === 'dev' };
}
function loadSettings(io = fs) {
  if (!io.existsSync(FILE)) return null;
  const fd = store.openPrivate(FILE, fs.constants.O_RDONLY, io);
  try {
    check(io.fstatSync(fd).size <= 2048, 'NSDOCS_STORAGE_CONFIG_INVALIDA');
    const value = JSON.parse(io.readFileSync(fd, 'utf8'));
    check(isDeepStrictEqual(value, SETTINGS), 'NSDOCS_STORAGE_CONFIG_INVALIDA');
    return value;
  } finally { io.closeSync(fd); }
}
function effectiveSettings(env = process.env, io = fs) {
  const saved = loadSettings(io);
  if (!saved) return env;
  for (const [key, value] of Object.entries(saved)) {
    check(!env[key] || env[key] === value, 'NSDOCS_STORAGE_CONFIG_CONFLITANTE');
  }
  return { ...env, ...saved };
}
async function saveSettings(io = fs) {
  return store.withLock(async () => {
    const previous = loadSettings(io);
    if (previous) return false;
    const fd = store.openPrivate(FILE, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, io);
    try { io.writeFileSync(fd, JSON.stringify(SETTINGS) + '\n'); io.fsyncSync(fd); }
    finally { io.closeSync(fd); }
    return true;
  }, io);
}
module.exports = { FILE, SETTINGS, fiscalAlignment, loadSettings, effectiveSettings, saveSettings };
