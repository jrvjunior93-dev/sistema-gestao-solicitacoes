'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const { PROD_BACKEND, PROD_NODE, check, companyCnpj, validateRuntime, validateFlags, verifyCompany } = require('./policy');
const { getRdsSsl } = require('./rdsTls');

function assertProdProcess() {
  check(process.platform === 'linux' && process.getuid() === 1000 && fs.realpathSync(process.cwd()) === PROD_BACKEND &&
    fs.readlinkSync('/proc/self/exe') === PROD_NODE && process.version === 'v24.22.1' &&
    process.env.DEPLOYMENT_ENV === 'production' && Number(process.env.PORT) === 8000 &&
    process.env.DB_HOST === 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com', 'NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_PROD');
  validateFlags(process.env);
}

function confirmWrite(kind, env = process.env, run = cp.execFileSync) {
  check(env.CONFIRM_PROD_BACKUP === 'SIM' && env.CONFIRM_PROD_BACKUP_TIMER === 'SIM'
    && env[kind === 'schema' ? 'CONFIRM_NSDOCS_PROD_SCHEMA' : 'CONFIRM_NSDOCS_PROD_CAPTURE'] === 'SIM',
    'NSDOCS_PROD_ESCRITA_EXIGE_BACKUP_TIMER_CONFIRMACAO');
  try { run('/usr/bin/systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer'],
    { timeout: 5000, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } }); }
  catch { check(false, 'NSDOCS_PROD_TIMER_INATIVO'); }
}

async function withProdDatabase(action, { write = false } = {}) {
  check(process.platform === 'linux' && process.getuid() === 1000 && fs.realpathSync(process.cwd()) === PROD_BACKEND,
    'NSDOCS_COMANDO_EXCLUSIVO_UBUNTU_PROD');
  const result = cp.spawnSync('/usr/bin/git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'branch', '--show-current'], {
    encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', HOME: '/home/ubuntu', LANG: 'C' }
  });
  check(!result.error && result.status === 0, 'NSDOCS_BRANCH_PROD_NAO_CONFERIDA');
  const { env, validateRequiredEnv } = require('../../../../../config/env');
  // Nao aceitar um export temporario que esconda automatico ligado no arquivo.
  validateFlags(require('dotenv').parse(fs.readFileSync(`${PROD_BACKEND}/.env`)));
  validateRuntime({ platform: process.platform, uid: process.getuid(), cwd: fs.realpathSync(process.cwd()),
    branch: result.stdout.trim(), env, executable: fs.readlinkSync('/proc/self/exe'), version: process.version });
  validateFlags(process.env); validateRequiredEnv();
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
    password: env.dbPassword, database: env.dbName, connectTimeout: 10000,
    // mysql2 normaliza o objeto recebido; o preset validado permanece imutavel.
    ssl: { ...getRdsSsl() } });
  try {
    // A identidade e o TLS sao conferidos em transacao somente leitura inclusive
    // antes de liberar o canal dedicado de escrita manual.
    await db.query('START TRANSACTION READ ONLY');
    const [tls] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    check(typeof tls[0]?.Value === 'string' && tls[0].Value.length > 0, 'NSDOCS_SESSAO_MYSQL_SEM_TLS');
    const [[identity]] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    check(identity.uuid === '5ed4b970-009f-11f1-809c-0ad0e0c90c53' && identity.banco === 'gestao_solicitacoes', 'NSDOCS_BANCO_PROD_DIVERGENTE');
    if (!write) return await action(db);
    await db.rollback();
    return await action(db);
  } finally {
    try { await db.rollback(); } finally { await db.end(); }
  }
}
async function loadProdCompany(companyId, cnpj) {
  companyCnpj(cnpj);
  check(Number.isSafeInteger(companyId) && companyId > 0, 'NSDOCS_EMPRESA_ID_INVALIDO');
  check(companyId === 1 && companyCnpj(cnpj) === '27123008000100', 'NSDOCS_EMPRESA_PROD_FORA_DO_PILOTO');
  return withProdDatabase(async db => {
    const [rows] = await db.execute('SELECT id, nome, razao_social, cnpj, ativo FROM empresas_grupo WHERE id = ?', [companyId]);
    check(rows.length === 1, 'NSDOCS_EMPRESA_LOCAL_DIVERGENTE');
    return verifyCompany(rows[0], companyId, cnpj);
  });
}
async function listProdCompanies() {
  return withProdDatabase(async db => {
    const [rows] = await db.query('SELECT id, nome, razao_social, cnpj, ativo FROM empresas_grupo WHERE ativo = 1 ORDER BY id LIMIT 100');
    return rows.map(row => {
      let cnpj = null;
      try { cnpj = companyCnpj(row.cnpj); } catch { /* Cadastro incompleto visivel, mas nao elegivel para consulta. */ }
      return { id: Number(row.id), name: String(row.razao_social || row.nome || '').slice(0, 200), cnpj, cnpj_valid: cnpj !== null };
    });
  });
}
module.exports = { loadProdCompany, listProdCompanies, assertProdProcess, confirmWrite,
  withProdReadDatabase: action => withProdDatabase(action),
  withProdWriteDatabase: action => withProdDatabase(action, { write: true }) };
