'use strict';
// Operador somente: conexao isolada antes de escrever CA/.env; nunca reinicia PM2.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), tls = require('node:tls');
const dotenv = require('dotenv');
const { conferirContexto, ROOT, ENV_FILE, CA_FILE, ALLOWED } = require('./releaseProducao20261016');
const CA_URL = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem';

function conteudoTls(original) {
  const antes = dotenv.parse(original);
  if (/[\r\n]/.test(antes.DB_SSL_CA_FILE || '') || (antes.DB_SSL_CA_FILE?.trim() && antes.DB_SSL_CA_FILE.trim() !== CA_FILE)) throw Error('CA existente diferente do destino autorizado; pare e confira.');
  let encontrou = false;
  let novo = original.split(/(\r?\n)/).map(linha => {
    if (!/^[\t ]*(?:export[\t ]+)?DB_SSL_CA_FILE[\t ]*=/.test(linha)) return linha;
    encontrou = true; return `DB_SSL_CA_FILE=${CA_FILE}`;
  }).join('');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  if (!encontrou) novo += `${novo && !/[\r\n]$/.test(novo) ? eol : ''}DB_SSL_CA_FILE=${CA_FILE}${eol}`;
  const depois = dotenv.parse(novo);
  if (depois.DB_SSL_CA_FILE !== CA_FILE || [...new Set([...Object.keys(antes), ...Object.keys(depois)])].some(k => k !== 'DB_SSL_CA_FILE' && antes[k] !== depois[k])) throw Error('A alteracao atingiria outra configuracao.');
  return novo;
}
function conferirRegular(fileSystem, file) {
  const stat = fileSystem.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fileSystem.realpathSync(file) !== file) throw Error('Arquivo nao exclusivo: ' + path.posix.basename(file));
  return stat;
}
function guardarTls(pem, fileSystem, log) {
  const gitDir = `${ROOT}/.git`, pasta = fileSystem.lstatSync(gitDir);
  if (!pasta.isDirectory() || pasta.isSymbolicLink() || fileSystem.realpathSync(gitDir) !== gitDir) throw Error('Diretorio privado de certificado divergente.');
  const stat = conferirRegular(fileSystem, ENV_FILE), anterior = fileSystem.readFileSync(ENV_FILE, 'utf8'), novo = conteudoTls(anterior);
  if (fileSystem.existsSync(CA_FILE)) {
    conferirRegular(fileSystem, CA_FILE);
    if (fileSystem.readFileSync(CA_FILE, 'utf8') !== pem) throw Error('Certificado existente difere do oficial recebido. Nao sobrescrever automaticamente.');
  } else fileSystem.writeFileSync(CA_FILE, pem, { flag: 'wx', mode: 0o600 });
  conferirRegular(fileSystem, CA_FILE);
  if (novo === anterior) { log('CA TLS oficial ja configurada; .env preservado.'); return; }
  const sufixo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const backup = `${ENV_FILE}.before-tls-${sufixo}.bak`, temporario = `${ENV_FILE}.tls-${sufixo}.tmp`;
  fileSystem.writeFileSync(backup, anterior, { flag: 'wx', mode: 0o600 });
  fileSystem.writeFileSync(temporario, novo, { flag: 'wx', mode: 0o600 });
  const atual = conferirRegular(fileSystem, ENV_FILE);
  if (atual.ino !== stat.ino || fileSystem.readFileSync(ENV_FILE, 'utf8') !== anterior) throw Error('.env mudou durante a preparacao. Backup preservado; pare e confira.');
  fileSystem.chmodSync(temporario, stat.mode & 0o777);
  fileSystem.renameSync(temporario, ENV_FILE);
  log(`Somente DB_SSL_CA_FILE alterado em producao. Backup privado: ${path.posix.basename(backup)}`);
}
async function executar({ modo, expectedSha, cwd, env, runtimeEnv = process.env, validateRequiredEnv, execFileSync,
  schema, criarConexao, fetcher = fetch, fileSystem = fs, validarPem = pem => tls.createSecureContext({ ca: pem }), log = console.log }) {
  if (!['--verificar', '--aplicar'].includes(modo)) throw Error('Use --verificar ou --aplicar TLS em producao.');
  conferirContexto({ modo: '--preflight', expectedSha, cwd, env, runtimeEnv, validateRequiredEnv, execFileSync, fileSystem, permitirTransicaoTls: true });
  conteudoTls(fileSystem.readFileSync(ENV_FILE, 'utf8')); // Valida destino antes de rede/escrita.
  if (modo === '--aplicar' && (runtimeEnv.PROD_RELEASE_TLS_CONFIRMED !== 'true'
    || runtimeEnv.PROD_RELEASE_BACKUP_CONFIRMED !== 'true' || runtimeEnv.PROD_RELEASE_TIMER_CONFIRMED !== 'true')) throw Error('TLS/backup/timer exigem confirmacao explicita.');
  const resposta = await fetcher(CA_URL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!resposta.ok) throw Error('Falha ao obter certificado oficial do RDS.');
  const pem = await resposta.text();
  if (pem.length > 500000 || !pem.includes('-----BEGIN CERTIFICATE-----')) throw Error('Certificado oficial recebido invalido.');
  validarPem(pem);
  let conexao;
  try {
    conexao = criarConexao({ host: env.dbHost, port: env.dbPort, dialect: 'mysql', logging: false,
      pool: { max: 1, min: 0 }, dialectOptions: { connectTimeout: 10000, ssl: { ca: pem, rejectUnauthorized: true, verifyIdentity: true } } });
    const [id] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    if (id[0]?.uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53' || id[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_PRODUCAO_DIFERENTE. Nenhuma configuracao alterada.');
    const [ssl] = await conexao.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
    const cipher = ssl.find(r => r.Variable_name === 'Ssl_cipher')?.Value, versao = ssl.find(r => r.Variable_name === 'Ssl_version')?.Value;
    if (!cipher || !versao) throw Error('TLS nao confirmado. Nenhuma configuracao alterada.');
    const state = await schema.getMigrationState();
    if (!state.tableExists || state.pending.some(name => !ALLOWED.includes(name))) throw Error('Migrations adicionais ou controle ausente: ' + state.pending.join(', '));
    log(`TLS isolado aprovado: ${versao}; ${cipher}. Certificado e identidade do servidor verificados.`);
    log('SHA256 do certificado: ' + crypto.createHash('sha256').update(pem).digest('hex'));
  } finally { if (conexao) await conexao.close(); }
  if (modo === '--aplicar') guardarTls(pem, fileSystem, log);
  else log('Somente leitura: nenhuma configuracao, migration ou processo alterado.');
}
if (require.main === module) {
  const { env, validateRequiredEnv } = require('../src/config/env');
  const db = require('../src/database');
  const { Sequelize } = require('sequelize');
  executar({ modo: process.argv[2], expectedSha: process.argv[3], cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv,
    execFileSync: require('node:child_process').execFileSync, schema: require('../src/database/runMigrations'),
    criarConexao: options => new Sequelize(env.dbName, env.dbUser, env.dbPassword, options) })
    .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { executar, conteudoTls, guardarTls, CA_URL };
