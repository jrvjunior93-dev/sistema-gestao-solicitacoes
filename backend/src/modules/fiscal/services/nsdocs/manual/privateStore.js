'use strict';
const fs = require('node:fs');
const { PRIVATE_DIR, CREDENTIAL_FILE, LOCK_FILE, HISTORY_FILE, check, companyCnpj, validKey, COOLDOWN_MS } = require('./policy');

function assertDirectory(io = fs) {
  const stat = io.lstatSync(PRIVATE_DIR);
  check(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 1000 &&
    (stat.mode & 0o777) === 0o700 && io.realpathSync(PRIVATE_DIR) === PRIVATE_DIR, 'NSDOCS_DIRETORIO_PRIVADO_INVALIDO');
}
function ensureDirectory(io = fs) {
  const parent = '/home/ubuntu/.config';
  if (!io.existsSync(parent)) io.mkdirSync(parent, { mode: 0o700 });
  const parentStat = io.lstatSync(parent);
  check(parentStat.isDirectory() && parentStat.uid === 1000 && (parentStat.mode & 0o022) === 0 &&
    io.realpathSync(parent) === parent, 'NSDOCS_DIRETORIO_PRIVADO_INVALIDO');
  if (!io.existsSync(PRIVATE_DIR)) io.mkdirSync(PRIVATE_DIR, { mode: 0o700 });
  assertDirectory(io);
}
function openPrivate(file, flags, io = fs) {
  assertDirectory(io);
  const fd = io.openSync(file, flags | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const stat = io.fstatSync(fd);
    check(stat.isFile() && stat.uid === 1000 && (stat.mode & 0o777) === 0o600 && stat.nlink === 1,
      'NSDOCS_ARQUIVO_PRIVADO_INVALIDO');
    return fd;
  } catch (error) { io.closeSync(fd); throw error; }
}
function parseCredentials(value) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { check(false, 'NSDOCS_CREDENCIAL_INVALIDA'); }
  check(parsed && Object.keys(parsed).sort().join(',') === 'apiKey,companyCnpj,companyId,environment,version' &&
    parsed.version === 1 && parsed.environment === 'development' && Number.isSafeInteger(parsed.companyId) && parsed.companyId > 0,
    'NSDOCS_CREDENCIAL_INVALIDA');
  companyCnpj(parsed.companyCnpj); validKey(parsed.apiKey);
  return parsed;
}
function saveCredentials({ companyId, companyCnpj: cnpj, apiKey }, io = fs) {
  const value = { version: 1, environment: 'development', companyId, companyCnpj: cnpj, apiKey };
  parseCredentials(JSON.stringify(value));
  ensureDirectory(io);
  // Criacao exclusiva: nunca sobrescrever/rotacionar uma chave existente implicitamente.
  let fd;
  try { fd = openPrivate(CREDENTIAL_FILE, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, io); }
  catch (error) { if (error.code === 'EEXIST') check(false, 'NSDOCS_CREDENCIAL_JA_EXISTE'); throw error; }
  try { io.writeFileSync(fd, `${JSON.stringify(value)}\n`, 'utf8'); io.fsyncSync(fd); }
  finally { io.closeSync(fd); }
}
function loadCredentials(io = fs) {
  let fd;
  try { fd = openPrivate(CREDENTIAL_FILE, fs.constants.O_RDONLY, io); }
  catch (error) { if (error.code === 'ENOENT') check(false, 'NSDOCS_CREDENCIAL_AUSENTE'); throw error; }
  try {
    check(io.fstatSync(fd).size <= 8192, 'NSDOCS_CREDENCIAL_INVALIDA');
    return parseCredentials(io.readFileSync(fd, 'utf8'));
  } finally { io.closeSync(fd); }
}
function withLock(action, io = fs) {
  return (async () => {
    let fd;
    try { fd = openPrivate(LOCK_FILE, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, io); }
    catch { check(false, 'NSDOCS_CONSULTA_OCUPADA_OU_LOCK_INVALIDO'); }
    try { io.writeFileSync(fd, `${process.pid}\n`); return await action(); }
    finally { io.closeSync(fd); io.unlinkSync(LOCK_FILE); }
  })();
}
function readHistory(io = fs) {
  if (!io.existsSync(HISTORY_FILE)) return [];
  const fd = openPrivate(HISTORY_FILE, fs.constants.O_RDONLY, io);
  try {
    check(io.fstatSync(fd).size <= 256 * 1024, 'NSDOCS_HISTORICO_LIMITE');
    const lines = io.readFileSync(fd, 'utf8').split('\n').filter(Boolean);
    return lines.map(line => {
      const item = JSON.parse(line);
      check(Number.isSafeInteger(item.at) && typeof item.outcome === 'string', 'NSDOCS_HISTORICO_INVALIDO');
      return item;
    });
  } finally { io.closeSync(fd); }
}
function appendHistory(event, io = fs) {
  // Whitelist estrita: nao aceitar payload/documentos/erro bruto/chave.
  const allowed = ['at', 'requestId', 'companyId', 'outcome', 'count'];
  check(Object.keys(event).every(key => allowed.includes(key)) && Number.isSafeInteger(event.at) &&
    /^NSDOCS_[A-Z0-9_]+$/.test(event.outcome) && /^[0-9a-f-]{36}$/.test(event.requestId) &&
    Number.isSafeInteger(event.companyId) && (event.count === undefined || Number.isSafeInteger(event.count)), 'NSDOCS_EVENTO_INVALIDO');
  const history = readHistory(io);
  check(history.length < 1000, 'NSDOCS_HISTORICO_LIMITE');
  const fd = openPrivate(HISTORY_FILE, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT, io);
  try { io.writeFileSync(fd, `${JSON.stringify(event)}\n`); io.fsyncSync(fd); } finally { io.closeSync(fd); }
}
function checkCooldown(now, io = fs) {
  const history = readHistory(io);
  // Reservar inicio e conclusao/falha antes de consumir uma chamada externa.
  check(history.length <= 998, 'NSDOCS_HISTORICO_LIMITE');
  check(history.every(item => now - item.at >= COOLDOWN_MS), 'NSDOCS_AGUARDE_60_SEGUNDOS');
}
module.exports = { assertDirectory, ensureDirectory, openPrivate, parseCredentials, saveCredentials,
  loadCredentials, withLock, readHistory, appendHistory, checkCooldown };
