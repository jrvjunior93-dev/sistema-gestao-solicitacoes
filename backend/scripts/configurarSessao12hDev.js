'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const ENV_FILE = `${BACKEND}/.env`;

function conteudoSessao12h(original) {
  const antes = dotenv.parse(original), eol = original.includes('\r\n') ? '\r\n' : '\n';
  if (/[\r\n]/.test(antes.JWT_EXPIRES_IN || '')) throw Error('JWT_EXPIRES_IN em varias linhas. Confira manualmente; nenhum arquivo alterado.');
  let encontrou = false;
  let novo = original.split(/(\r?\n)/).map(linha => {
    if (!/^[\t ]*(?:export[\t ]+)?JWT_EXPIRES_IN[\t ]*=/.test(linha)) return linha;
    encontrou = true;
    return 'JWT_EXPIRES_IN=12h';
  }).join('');
  if (!encontrou) novo += `${novo && !/[\r\n]$/.test(novo) ? eol : ''}JWT_EXPIRES_IN=12h${eol}`;
  const depois = dotenv.parse(novo);
  if (depois.JWT_EXPIRES_IN !== '12h'
    || [...new Set([...Object.keys(antes), ...Object.keys(depois)])].some(k => k !== 'JWT_EXPIRES_IN' && antes[k] !== depois[k])) {
    throw Error('Alteracao atingiria outra variavel. Nenhum arquivo alterado.');
  }
  return novo;
}

function guardarConfiguracao(fileSystem, log) {
  const stat = fileSystem.lstatSync(ENV_FILE);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fileSystem.realpathSync(ENV_FILE) !== ENV_FILE) throw Error('.env DEV nao e arquivo exclusivo deste checkout. Nenhum arquivo alterado.');
  const anterior = fileSystem.readFileSync(ENV_FILE, 'utf8'), novo = conteudoSessao12h(anterior);
  if (novo === anterior) { log('JWT_EXPIRES_IN ja esta em 12h no .env DEV.'); return; }
  const sufixo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const backup = `${ENV_FILE}.before-session-12h-${sufixo}.bak`, temporario = `${ENV_FILE}.session-12h-${sufixo}.tmp`;
  // Backup/temporario nascem 0600; nunca copiar segredos para log ou Git.
  fileSystem.writeFileSync(backup, anterior, { flag: 'wx', mode: 0o600 });
  fileSystem.writeFileSync(temporario, novo, { flag: 'wx', mode: 0o600 });
  const atual = fileSystem.lstatSync(ENV_FILE);
  if (atual.ino !== stat.ino || atual.nlink !== 1 || atual.isSymbolicLink() || fileSystem.readFileSync(ENV_FILE, 'utf8') !== anterior) throw Error('.env mudou durante a preparacao. Backup preservado; pare e confira.');
  fileSystem.chmodSync(temporario, stat.mode & 0o777);
  fileSystem.renameSync(temporario, ENV_FILE);
  log(`Somente JWT_EXPIRES_IN alterado para 12h no DEV. Backup privado: ${path.posix.basename(backup)}`);
}

async function executar({ modo, cwd, env, runtimeEnv, validateRequiredEnv, db, schema, execFileSync, fileSystem = fs, log = console.log }) {
  if (!['--aplicar', '--verificar'].includes(modo)) throw Error('Use --aplicar ou --verificar exclusivamente no DEV.');
  validateRequiredEnv();
  if (cwd !== BACKEND || env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com') throw Error('AMBIENTE_DEV_DIFERENTE. Nenhuma configuracao alterada.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const p = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(p?.pm_exec_path || '') !== `${BACKEND}/server.js` || Number(p.PORT || env.port) !== 8001) throw Error('PROCESSO_DEV_DIFERENTE. Nenhuma configuracao alterada.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (p[key] !== undefined && String(p[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`Variavel ${key} diverge no PM2. Confira sem compartilhar segredos.`);
  }
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (p[key] !== undefined && ['1', 'true', 'yes', 'on'].includes(String(p[key]).trim().toLowerCase()) !== carregado) throw Error(`Flag ${key} divergente. Nenhuma configuracao alterada.`);
  }
  if (p.PAYMENT_OWNER_APPROVAL_MODE !== undefined && String(p.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('PAYMENT_OWNER_APPROVAL_MODE divergente. Nenhuma flag alterada.');
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE. Nenhuma configuracao alterada.');
  await schema.assertMigrationsUpToDate(); // Leitura apenas; nao executa migrations.
  if (modo === '--aplicar') guardarConfiguracao(fileSystem, log);
  else {
    if (env.jwtExpiresIn !== '12h' || String(p.JWT_EXPIRES_IN || '').trim() !== '12h' || dotenv.parse(fileSystem.readFileSync(ENV_FILE, 'utf8')).JWT_EXPIRES_IN !== '12h') throw Error('JWT_EXPIRES_IN nao confirmado como 12h no .env/configuracao/PM2 DEV.');
    log('Sessao DEV confirmada em 12h no .env e PM2. Novo login necessario; inatividade e demais flags preservadas.');
  }
}

if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env, validateRequiredEnv, db,
    schema: require('../src/database/runMigrations'), execFileSync: require('node:child_process').execFileSync })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, conteudoSessao12h, ENV_FILE, BACKEND };
