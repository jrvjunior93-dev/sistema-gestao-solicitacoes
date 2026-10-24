'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const { DEV_BACKEND, DEV_NODE, check, companyCnpj, validateRuntime, validateFlags, verifyCompany } = require('./policy');
const { getRdsSsl } = require('./rdsTls');

function assertDevProcess() {
  check(process.platform === 'linux' && process.getuid() === 1000 && fs.realpathSync(process.cwd()) === DEV_BACKEND &&
    fs.readlinkSync('/proc/self/exe') === DEV_NODE && process.version === 'v24.22.1' &&
    process.env.DEPLOYMENT_ENV === 'development' && Number(process.env.PORT) === 8001 &&
    process.env.DB_HOST === 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', 'NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_DEV');
  validateFlags(process.env);
}

async function withDevDatabase(action) {
  check(process.platform === 'linux' && process.getuid() === 1000 && fs.realpathSync(process.cwd()) === DEV_BACKEND,
    'NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_DEV');
  const result = cp.spawnSync('/usr/bin/git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'branch', '--show-current'], {
    encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', HOME: '/home/ubuntu', LANG: 'C' }
  });
  check(!result.error && result.status === 0, 'NSDOCS_BRANCH_DEV_NAO_CONFERIDA');
  const { env, validateRequiredEnv } = require('../../../../../config/env');
  validateRuntime({ platform: process.platform, uid: process.getuid(), cwd: fs.realpathSync(process.cwd()),
    branch: result.stdout.trim(), env, executable: fs.readlinkSync('/proc/self/exe'), version: process.version });
  validateFlags(process.env); validateRequiredEnv();
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
    password: env.dbPassword, database: env.dbName, connectTimeout: 10000,
    ssl: getRdsSsl() });
  try {
    await db.query('START TRANSACTION READ ONLY');
    const [tls] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    check(typeof tls[0]?.Value === 'string' && tls[0].Value.length > 0, 'NSDOCS_SESSAO_MYSQL_SEM_TLS');
    const [[identity]] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    check(identity.uuid === '60f043e9-4025-11f1-9a61-06d8a063012d' && identity.banco === 'gestao_solicitacoes', 'NSDOCS_BANCO_DEV_DIVERGENTE');
    return await action(db);
  } finally {
    try { await db.rollback(); } finally { await db.end(); }
  }
}
async function loadDevCompany(companyId, cnpj) {
  companyCnpj(cnpj);
  check(Number.isSafeInteger(companyId) && companyId > 0, 'NSDOCS_EMPRESA_ID_INVALIDO');
  return withDevDatabase(async db => {
    const [rows] = await db.execute('SELECT id, nome, razao_social, cnpj, ativo FROM empresas_grupo WHERE id = ?', [companyId]);
    check(rows.length === 1, 'NSDOCS_EMPRESA_LOCAL_DIVERGENTE');
    return verifyCompany(rows[0], companyId, cnpj);
  });
}
async function listDevCompanies() {
  return withDevDatabase(async db => {
    const [rows] = await db.query('SELECT id, nome, razao_social, cnpj, ativo FROM empresas_grupo WHERE ativo = 1 ORDER BY id LIMIT 100');
    return rows.map(row => {
      let cnpj = null;
      try { cnpj = companyCnpj(row.cnpj); } catch { /* Cadastro incompleto visivel, mas nao elegivel para consulta. */ }
      return { id: Number(row.id), name: String(row.razao_social || row.nome || '').slice(0, 200), cnpj, cnpj_valid: cnpj !== null };
    });
  });
}
module.exports = { loadDevCompany, listDevCompanies, assertDevProcess };
