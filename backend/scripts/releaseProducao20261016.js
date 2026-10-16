'use strict';
// One-shot supervisionado. Nunca importado pelo servidor ou executado na Vercel.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { conteudoSessao12h } = require('./configurarSessao12hDev');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main';
const BASE = '7e1015abf376afddde8d62b1e590271746881355';
const SOURCE = 'fb9a0e89e944017dcaacafdefed4f66a88c87e34';
const ALLOWED = Object.freeze([
  '202610150003_contrato_medicao_encerramento.js',
  '202610160001_titulos_compartilhados.js',
  '202610160002_medicao_pagamento_autorizado.js'
]);
const MODES = ['--preflight', '--aplicar-migrations', '--sessao-12h', '--verificar'];
const ENV_FILE = `${ROOT}/backend/.env`;
const CA_FILE = `${ROOT}/.git/fluxy-rds-global-bundle.pem`;

function conferirArquivo(fileSystem) {
  const stat = fileSystem.lstatSync(ENV_FILE);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fileSystem.realpathSync(ENV_FILE) !== ENV_FILE) throw Error('.env de producao nao e arquivo exclusivo do checkout main.');
  return stat;
}
function guardarSessao(fileSystem, log) {
  const stat = conferirArquivo(fileSystem), anterior = fileSystem.readFileSync(ENV_FILE, 'utf8');
  const novo = conteudoSessao12h(anterior);
  if (novo === anterior) { log('JWT_EXPIRES_IN ja esta em 12h no .env de producao.'); return; }
  const sufixo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const backup = `${ENV_FILE}.before-session-12h-${sufixo}.bak`, temporario = `${ENV_FILE}.session-12h-${sufixo}.tmp`;
  fileSystem.writeFileSync(backup, anterior, { flag: 'wx', mode: 0o600 });
  fileSystem.writeFileSync(temporario, novo, { flag: 'wx', mode: 0o600 });
  const atual = conferirArquivo(fileSystem);
  if (atual.ino !== stat.ino || fileSystem.readFileSync(ENV_FILE, 'utf8') !== anterior) throw Error('.env mudou durante a preparacao. Backup preservado; pare e confira.');
  fileSystem.chmodSync(temporario, stat.mode & 0o777);
  fileSystem.renameSync(temporario, ENV_FILE);
  log(`Somente JWT_EXPIRES_IN alterado para 12h em producao. Backup privado: ${path.posix.basename(backup)}`);
}

function conferirContexto({ modo, expectedSha, cwd, env, runtimeEnv = process.env, validateRequiredEnv,
  execFileSync, fileSystem = fs, permitirTransicaoTls = false }) {
  if (!MODES.includes(modo)) throw Error('Modo de release invalido.');
  validateRequiredEnv();
  if (cwd !== `${ROOT}/backend` || env.deploymentEnvironment !== 'production' || Number(env.port) !== 8000
    || env.dbHost !== 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com'
    || env.dbName !== 'gestao_solicitacoes' || env.devUserSwitchEnabled !== false) throw Error('AMBIENTE_PRODUCAO_DIFERENTE. Nenhuma alteracao executada.');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || git('rev-parse', 'HEAD') !== expectedSha
    || git('branch', '--show-current') !== 'main' || git('status', '--porcelain', '--untracked-files=no')) throw Error('Checkout main/commit divergente ou arquivos rastreados alterados.');
  git('merge-base', '--is-ancestor', BASE, expectedSha);
  git('merge-base', '--is-ancestor', SOURCE, expectedSha);
  conferirArquivo(fileSystem);
  const arquivoEnv = dotenv.parse(fileSystem.readFileSync(ENV_FILE, 'utf8'));
  if (arquivoEnv.DB_HOST !== env.dbHost || arquivoEnv.DB_NAME !== env.dbName) throw Error('.env do checkout difere do banco configurado.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
  const pmEnv = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(pmEnv?.pm_exec_path || '') !== `${ROOT}/backend/server.js`
    || Number(pmEnv.PORT || env.port) !== 8000) throw Error('PROCESSO_PRODUCAO_DIFERENTE. Nenhum processo alterado.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
  }
  const caPm = String(pmEnv.DB_SSL_CA_FILE || '').trim(), caConfigurada = String(runtimeEnv.DB_SSL_CA_FILE || '').trim();
  const transicaoTls = permitirTransicaoTls && !caPm && caConfigurada === CA_FILE
    && env.dbSslCaFile === CA_FILE && arquivoEnv.DB_SSL_CA_FILE === CA_FILE
    && runtimeEnv.PROD_RELEASE_TLS_CONFIRMED === 'true'
    && runtimeEnv.PROD_RELEASE_BACKUP_CONFIRMED === 'true' && runtimeEnv.PROD_RELEASE_TIMER_CONFIRMED === 'true';
  if (pmEnv.DB_SSL_CA_FILE !== undefined && caPm !== caConfigurada && !transicaoTls) throw Error('DB_SSL_CA_FILE diverge do PM2 fora da transicao TLS autorizada.');
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (pmEnv[key] !== undefined && ['1', 'true', 'yes', 'on'].includes(String(pmEnv[key]).trim().toLowerCase()) !== carregado) throw Error(`Flag ${key} divergente. Nao alterar para contornar.`);
  }
  const modos = ['OFF', 'PILOT', 'ENFORCED', 'PAUSED'];
  const configurado = String(runtimeEnv.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase();
  const atual = String(pmEnv.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase();
  if (!modos.includes(configurado) || !modos.includes(atual) || configurado !== env.paymentOwnerApprovalMode || atual !== configurado) throw Error('Modo de autorizacao invalido ou divergente. Nao alterar a flag para contornar.');
  return { arquivoEnv, pmEnv, git, atual, transicaoTls };
}
async function executar({ modo, expectedSha, cwd, env, runtimeEnv = process.env, validateRequiredEnv,
  db, schema, execFileSync, fileSystem = fs, log = console.log }) {
  const { arquivoEnv, pmEnv, git, atual, transicaoTls } = conferirContexto({ modo, expectedSha, cwd, env, runtimeEnv,
    validateRequiredEnv, execFileSync, fileSystem, permitirTransicaoTls: modo !== '--verificar' });
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53' || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_PRODUCAO_DIFERENTE. Nenhuma alteracao executada.');
  const [ssl] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (!ssl[0]?.Value) throw Error('Conexao TLS com o banco nao confirmada. Pare e confira.');
  if (transicaoTls) log('Transicao autorizada: somente CA TLS vazia no PM2 passa ao certificado oficial antes do restart.');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => !ALLOWED.includes(nome))) throw Error('Migrations adicionais ou controle ausente. Pare e envie a lista: ' + state.pending.join(', '));
  for (const name of ALLOWED) {
    const source = fileSystem.readFileSync(path.posix.join(ROOT, 'backend/migrations', name), 'utf8').replace(/\r\n/g, '\n');
    if (source.trimEnd() !== git('show', `${SOURCE}:backend/migrations/${name}`).trimEnd()) throw Error('Migration difere da versao homologada: ' + name);
    schema.assertMigrationSourceIsSchemaOnly(name, source);
  }
  log('PRODUCAO conferida: commit, checkout, processo, porta 8000, banco/TLS e flags.');
  log('Modo de autorizacao preservado: ' + atual);
  log('Migrations pendentes autorizadas: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--preflight') { log('Somente leitura. Nenhuma configuracao, schema ou processo alterado.'); return; }
  if (['--aplicar-migrations', '--sessao-12h'].includes(modo)
    && (runtimeEnv.PROD_RELEASE_BACKUP_CONFIRMED !== 'true' || runtimeEnv.PROD_RELEASE_TIMER_CONFIRMED !== 'true')) throw Error('Confirme backup cifrado de producao e timer antes de aplicar.');
  if (modo === '--aplicar-migrations' && state.pending.length) {
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try { runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; await schema.runMigrations({ authorized: true }); }
    finally { if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS; else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior; }
  }
  await schema.assertMigrationsUpToDate();
  if (modo === '--sessao-12h') guardarSessao(fileSystem, log);
  if (modo === '--verificar') {
    if (env.dbSslCaFile !== CA_FILE || arquivoEnv.DB_SSL_CA_FILE !== CA_FILE || String(pmEnv.DB_SSL_CA_FILE || '').trim() !== CA_FILE) throw Error('TLS persistente nao confirmado no .env/configuracao/PM2 de producao.');
    if (env.jwtExpiresIn !== '12h' || arquivoEnv.JWT_EXPIRES_IN !== '12h' || String(pmEnv.JWT_EXPIRES_IN || '').trim() !== '12h') throw Error('Sessao12h nao confirmada no .env/configuracao/PM2 de producao.');
    log('Sessao de producao confirmada em 12h. Novo login necessario; inatividade preservada.');
  }
  log('Release conferido. Sem seeds/backfills; nenhum processo reiniciado por este helper.');
}
if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], expectedSha: process.argv[3], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv,
    db, schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, conferirContexto, guardarSessao, ROOT, BASE, SOURCE, ALLOWED, ENV_FILE, CA_FILE };
