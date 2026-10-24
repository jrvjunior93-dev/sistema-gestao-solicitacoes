'use strict';
const { isValidCnpj } = require('../../../../../utils/cpfCnpj');
const { buildListRequest } = require('../contract');
const { fail } = require('../config');

const DEV_BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const DEV_NODE = '/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node';
const PRIVATE_DIR = '/home/ubuntu/.config/fluxy-nsdocs-dev';
const CREDENTIAL_FILE = `${PRIVATE_DIR}/credentials.json`;
const LOCK_FILE = `${PRIVATE_DIR}/query.lock`;
const HISTORY_FILE = `${PRIVATE_DIR}/history.jsonl`;
const COOLDOWN_MS = 60000;

function check(ok, code) { if (!ok) fail(code); }
function companyCnpj(value) {
  check(typeof value === 'string' && /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(value), 'NSDOCS_CNPJ_INVALIDO');
  const digits = value.replace(/\D/g, '');
  check(isValidCnpj(digits), 'NSDOCS_CNPJ_INVALIDO');
  return digits;
}
function validateRuntime({ platform, uid, cwd, branch, env, executable, version }) {
  check(platform === 'linux' && uid === 1000 && cwd === DEV_BACKEND && branch === 'refactor/frontend' &&
    executable === DEV_NODE && version === 'v24.22.1', 'NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_DEV');
  check(env.deploymentEnvironment === 'development' && Number(env.port) === 8001 &&
    env.dbHost === 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' &&
    env.dbName === 'gestao_solicitacoes', 'NSDOCS_AMBIENTE_DEV_DIVERGENTE');
}
function validateFlags(env) {
  for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    check(env[key] === undefined || env[key] === '' || env[key] === 'false', 'NSDOCS_APLICACAO_DEVE_PERMANECER_DESLIGADA');
  }
  check(env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'NSDOCS_TLS_OBRIGATORIO');
}
function verifyCompany(row, id, cnpj) {
  check(row && Number(row.id) === id && [true, 1].includes(row.ativo) &&
    companyCnpj(row.cnpj) === companyCnpj(cnpj), 'NSDOCS_EMPRESA_LOCAL_DIVERGENTE');
  return { id, cnpj: companyCnpj(cnpj), name: String(row.razao_social || row.nome || '').slice(0, 200), ativo: true };
}
function validateQuery(input, credentials) {
  const request = buildListRequest(input, companyCnpj(credentials.companyCnpj));
  const days = (Date.parse(request.endDate) - Date.parse(request.startDate)) / 86400000 + 1;
  check(days <= 31 && request.limit <= 20, 'NSDOCS_CONSULTA_MANUAL_LIMITE_31_DIAS_20_DOCUMENTOS');
  return request;
}
function validKey(value) {
  check(typeof value === 'string' && /^[\x21-\x7e]{16,4096}$/.test(value), 'NSDOCS_CHAVE_FORMATO_INVALIDO');
  return value;
}
function assertNoSecret(value, key) {
  const pending = [value]; let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    check(++visited <= 10000, 'NSDOCS_RESPOSTA_COMPLEXA');
    if (typeof current === 'string') check(!current.includes(key), 'NSDOCS_RESPOSTA_CONTEM_SEGREDO');
    else if (current && typeof current === 'object') {
      for (const [name, item] of Object.entries(current)) { pending.push(name, item); }
    }
  }
}
function errorCode(error) {
  return /^NSDOCS_[A-Z0-9_]{1,100}$/.test(error?.code || '') ? error.code : 'NSDOCS_FALHA_SANITIZADA';
}
module.exports = { DEV_BACKEND, DEV_NODE, PRIVATE_DIR, CREDENTIAL_FILE, LOCK_FILE, HISTORY_FILE,
  COOLDOWN_MS, check, companyCnpj, validateRuntime, validateFlags, verifyCompany, validateQuery, validKey, assertNoSecret, errorCode };
