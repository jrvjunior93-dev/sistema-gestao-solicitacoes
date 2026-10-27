'use strict';
// Atualiza apenas os arquivos do comando administrativo. Nunca reinicia servicos.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), http = require('node:http');
const { isDeepStrictEqual } = require('node:util');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-dev';
const BACKEND = `${ROOT}/backend`;
const NODE = '/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node';
const PM2_NODE = '/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const PM2_CLI = '/usr/lib/node_modules/pm2/bin/pm2';
const BASE = '0b9f209b13254d5da89499fc7cd91f3faef8c99f';
const CA_PATH = 'backend/src/modules/fiscal/services/nsdocs/manual/rds-ca-us-east-2.json';
const CA_SHA256 = 'd46e1bdfda05c8e7644e50930806a19b139a222542bf0348082fb59ece2b5fa5';
const CHANGESET = [
  'M\tbackend/package.json', 'M\tbackend/package-lock.json', 'M\tdocs/modulos/fiscal/README.md',
  'M\tbackend/scripts/validarNsdocsManualDev.js', 'M\tbackend/src/modules/fiscal/validators/fiscalValidators.js',
  ...['runtime.js', 'transport.js', 'query.js'].map(file => `M\tbackend/src/modules/fiscal/services/nsdocs/manual/${file}`),
  ...['capture.js', 'captureSettings.js', 'iam.js', 'iam-dev-policy.json', 'iam-dev-trust.json', 'repository.js', 'storage.js', 'xml.js', 'migrationDev.js']
    .map(file => `A\tbackend/src/modules/fiscal/services/nsdocs/manual/${file}`),
  ...['nsdocsDevCapture.js', 'nsdocsDevSetup.js', 'validarNsdocsCapturaDev.js', 'validarNsdocsSetupDev.js'].map(file => `A\tbackend/scripts/${file}`),
  'A\tbackend/migrations/202610240001_fiscal_nsdocs_capturas.js',
  'A\tdocs/modulos/fiscal/NSDOCS_V2_CAPTURA_MANUAL_DEV.md', 'A\tdocs/modulos/fiscal/NSDOCS_V2_IAM_DEV.md',
  'A\tdocs/handoffs/2026-10-24-nsdocs-captura-manual-persistente-dev.md',
  'A\tdocs/handoffs/2026-10-24-publicacao-nsdocs-captura-dev.md',
  'A\tops/deploy/README-nsdocs-captura-dev-20261024.md',
  'A\tops/deploy/atualizar-dev-nsdocs-captura-20261024.cjs',
  'A\tops/deploy/atualizar-dev-nsdocs-captura-20261024.test.cjs'
];
function check(ok, code) { if (!ok) throw Error(code); }
const cleanEnv = () => ({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/home/ubuntu',
  USER: 'ubuntu', LOGNAME: 'ubuntu', LANG: 'C', PM2_HOME: '/home/ubuntu/.pm2' });
function run(bin, args, options = {}) {
  const result = cp.spawnSync(bin, args, { cwd: ROOT, env: cleanEnv(), encoding: 'utf8', timeout: 45000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (args[0] === 'scripts/nsdocsDevSetup.js' && result.status !== 0) {
    const safe = String(result.stderr || '').split(/\r?\n/).find(line => /^NSDOCS_[A-Z0-9_]{1,95}$/.test(line));
    if (safe) throw Error(safe);
  }
  check(!result.error && result.status === 0,
    `COMANDO_FALHOU_${path.basename(bin).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${result.status ?? 'SEM_SAIDA'}`);
  return result.stdout.trim();
}
const git = args => run('/usr/bin/git', args);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function validateInventory(diff) {
  check(isDeepStrictEqual([...diff].sort(), [...CHANGESET].sort()), 'INVENTARIO_FORA_DO_ESCOPO_MANUAL');
}
function validatePackage(before, after) {
  const candidate = structuredClone(after);
  for (const [key, value] of Object.entries({
    'test:nsdocs-captura-dev': 'node --test scripts/validarNsdocsCapturaDev.js scripts/validarNsdocsSetupDev.js',
    'test:deploy-nsdocs-captura-dev': 'node --test ../ops/deploy/atualizar-dev-nsdocs-captura-20261024.test.cjs'
  })) {
    check(before.scripts[key] === undefined && candidate.scripts[key] === value, 'SCRIPT_QA_MANUAL_DIFERENTE');
    delete candidate.scripts[key];
  }
  for (const [key, value] of Object.entries({ saxes: '5.0.1', '@aws-sdk/nested-clients': '3.996.12' })) {
    check(before.dependencies[key] === undefined && candidate.dependencies[key] === value, 'DEPENDENCIA_NOVA_DIVERGENTE');
    delete candidate.dependencies[key];
  }
  check(isDeepStrictEqual(before, candidate), 'DEPENDENCIAS_OU_SCRIPTS_FORA_DO_ESCOPO');
}
function validateLock(before, after) {
  const candidate = structuredClone(after);
  for (const [key, value] of Object.entries({ saxes: '5.0.1', '@aws-sdk/nested-clients': '3.996.12' })) {
    check(before.packages[''].dependencies[key] === undefined && candidate.packages[''].dependencies[key] === value &&
      before.packages[`node_modules/${key}`]?.version === value, 'LOCK_DEPENDENCIA_NAO_EXISTIA_NA_BASE');
    delete candidate.packages[''].dependencies[key];
  }
  check(isDeepStrictEqual(before, candidate), 'LOCK_ALTERADO_FORA_DAS_DECLARACOES');
}
function validateFlags(env) {
  for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    check(env[key] === undefined || env[key] === '' || env[key] === 'false', 'NSDOCS_AUTOMATICO_DEVE_CONTINUAR_DESLIGADO');
  }
}
function validateCaBundle(bundle, now = Date.now()) {
  check(bundle?.region === 'us-east-2' && bundle.source === 'https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem' &&
    bundle.sha256 === CA_SHA256 && typeof bundle.pem === 'string' && !bundle.pem.includes('PRIVATE KEY') &&
    hash(bundle.pem) === CA_SHA256, 'NSDOCS_CA_RDS_INVALIDA');
  try {
    const roots = bundle.pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    check(roots?.length === 3 && Number.isFinite(now), 'NSDOCS_CA_RDS_INVALIDA');
    for (const pem of roots) {
      const certificate = new crypto.X509Certificate(pem);
      check(certificate.ca && certificate.verify(certificate.publicKey) &&
        certificate.subject.includes('Amazon RDS us-east-2 Root CA') &&
        Date.parse(certificate.validFrom) <= now && Date.parse(certificate.validTo) > now, 'NSDOCS_CA_RDS_INVALIDA');
    }
  } catch { check(false, 'NSDOCS_CA_RDS_INVALIDA'); }
}
function list() {
  const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim());
  check(pid > 1 && fs.readlinkSync(`/proc/${pid}/exe`) === PM2_NODE, 'DAEMON_ISOLADO_INDISPONIVEL');
  // Unico comando PM2 permitido neste operador: leitura, com daemon ja existente.
  return JSON.parse(run(PM2_NODE, [PM2_CLI, 'jlist']));
}
function snapshotProcesses(processes) {
  const expected = {
    'backend-dev': [BACKEND, NODE, 'server.js'],
    'backend-solicitacoes': ['/home/ubuntu/sistema-gestao-solicitacoes-main/backend', '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node', 'server.js'],
    'fluxy-experience-api': ['/home/ubuntu/fluxy-experience/api', '/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node', 'src/server.js']
  };
  check(processes.length === 3 && Object.keys(expected).every(name => processes.filter(p => p.name === name).length === 1), 'INVENTARIO_PM2_DIFERENTE');
  return processes.map(p => {
    const e = p.pm2_env || {}, [cwd, node, script] = expected[p.name];
    check(p.pid > 0 && e.status === 'online' && e.pm_cwd === cwd && e.pm_exec_path === `${cwd}/${script}` &&
      e.exec_interpreter === node && e.exec_mode === 'fork_mode' && (!e.watch || Array.isArray(e.watch) && e.watch.length === 0), 'POLITICA_PROCESSO_DIVERGENTE');
    check(fs.readlinkSync(`/proc/${p.pid}/exe`) === node && run(`/proc/${p.pid}/exe`, ['--version']) === 'v24.22.1', 'NODE_ISOLADO_DIVERGENTE');
    if (p.name === 'backend-dev') { validateFlags(e); validateFlags(e.env || {}); }
    return { name: p.name, id: p.pm_id, pid: p.pid, cwd, script: e.pm_exec_path, node,
      uptime: e.pm_uptime, restarts: e.restart_time,
      env: hash(JSON.stringify(stable(e.env || {}))), envFile: fileHash(`${cwd}/.env`),
      initialEnvironment: fileHash(`/proc/${p.pid}/environ`) };
  }).sort((a, b) => a.id - b.id);
}
function assertPreserved(before, after) {
  check(isDeepStrictEqual(before, after), 'PROCESSO_OU_AMBIENTE_MUDOU');
}
function effectiveEnv(p) {
  const env = Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8').split('\0').filter(Boolean)
    .map(pair => { const index = pair.indexOf('='); return [pair.slice(0, index), pair.slice(index + 1)]; }));
  for (const key of ['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID']) delete env[key];
  return env;
}
function preflight(env, bundle) {
  validateFlags(env);
  const code = `
    const fs = require('node:fs');
    const stored = require('dotenv').parse(fs.readFileSync('.env'));
    for (const item of [stored, process.env]) for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED'])
      if (item[key] !== undefined && item[key] !== '' && item[key] !== 'false') process.exit(70);
    const { env, validateRequiredEnv } = require('./src/config/env'); validateRequiredEnv();
    if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001 ||
      env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' || env.dbName !== 'gestao_solicitacoes' ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
      /^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) process.exit(71);
    const diagnostic = require('./src/modules/fiscal/services/nsdocs/config').getDiagnostics();
    if (diagnostic.enabled || !diagnostic.configuration_valid || diagnostic.mode !== 'disabled') process.exit(72);
    const mysql = require('mysql2/promise');
    const publicCa = JSON.parse(fs.readFileSync(0, 'utf8'));
    (async () => {
      const db = await mysql.createConnection({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
        password: env.dbPassword, database: env.dbName, connectTimeout: 10000,
        ssl: { ca: publicCa.pem, rejectUnauthorized: true, verifyIdentity: true } });
      try {
        await db.query('START TRANSACTION READ ONLY');
        const [tls] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
        if (typeof tls[0]?.Value !== 'string' || !tls[0].Value) throw Error('SEM_TLS');
        const [[identity]] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
        if (identity.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || identity.banco !== 'gestao_solicitacoes') throw Error('DB_DEV');
      } finally { try { await db.rollback(); } finally { await db.end(); } }
    })().catch(() => { process.exitCode = 73; });
  `;
  // Nao imprimir dotenv, ambiente, credencial ou erro bruto do subprocesso.
  run(NODE, ['-e', code], { cwd: BACKEND, env, input: JSON.stringify(bundle), stdio: ['pipe', 'pipe', 'pipe'] });
}
function health(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', value => { body += value; if (body.length > 4096) req.destroy(); });
      res.on('error', () => resolve(false));
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
function parseCompanies(output) {
  let parsed;
  try { parsed = JSON.parse(output.split(/\r?\n/).at(-1)); } catch { check(false, 'LISTAGEM_LOCAL_INVALIDA'); }
  check(parsed.outcome === 'NSDOCS_EMPRESAS_LOCAIS_DEV' && parsed.external_calls === 0 && Array.isArray(parsed.companies) &&
    parsed.companies.length <= 100, 'LISTAGEM_LOCAL_INVALIDA');
  return parsed.companies.map(item => {
    check(Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string' && item.name.length <= 200 &&
      (item.cnpj === null || /^\d{14}$/.test(item.cnpj)) && typeof item.cnpj_valid === 'boolean', 'LISTAGEM_LOCAL_INVALIDA');
    return { id: item.id, name: item.name, cnpj: item.cnpj, cnpj_valid: item.cnpj_valid };
  });
}
async function main(version) {
  check(process.platform === 'linux' && process.getuid() === 1000 && /^[0-9a-f]{40}$/.test(version || ''), 'EXIGE_UBUNTU_E_SHA_COMPLETO');
  check(fs.realpathSync(process.cwd()) === ROOT && git(['rev-parse', '--show-toplevel']) === ROOT &&
    git(['branch', '--show-current']) === 'refactor/frontend', 'CHECKOUT_DEV_DIVERGENTE');
  check(!git(['status', '--porcelain', '--untracked-files=no']), 'DEV_TEM_ARQUIVOS_RASTREADOS_ALTERADOS');
  check([BASE, version].includes(git(['rev-parse', 'HEAD'])), 'ETAPA_DEV_ANTERIOR_PENDENTE');
  git(['merge-base', '--is-ancestor', version, 'origin/refactor/frontend']);
  validateInventory(git(['diff', '--name-status', BASE, version]).split(/\r?\n/).filter(Boolean));
  validatePackage(JSON.parse(git(['show', `${BASE}:backend/package.json`])), JSON.parse(git(['show', `${version}:backend/package.json`])));
  validateLock(JSON.parse(git(['show', `${BASE}:backend/package-lock.json`])), JSON.parse(git(['show', `${version}:backend/package-lock.json`])));
  const bundle = JSON.parse(git(['show', `${version}:${CA_PATH}`]));
  validateCaBundle(bundle);
  const lock = path.resolve(ROOT, git(['rev-parse', '--git-path', 'nsdocs-manual-deploy.lock']));
  fs.mkdirSync(lock, { mode: 0o700 });
  try {
    const processes = list(), initial = snapshotProcesses(processes), env = effectiveEnv(processes.find(p => p.name === 'backend-dev'));
    const files = ['/home/ubuntu/.pm2/dump.pm2', '/home/ubuntu/.pm2/dump.pm2.bak', '/home/ubuntu/.pm2/pm2.pid',
      '/etc/systemd/system/pm2-ubuntu.service', '/usr/bin/node', NODE, PM2_NODE, PM2_CLI,
      ...initial.map(p => p.node)];
    const hashes = [...new Set(files)].map(file => [file, fileHash(file)]);
    const daemonPid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8'));
    const start = () => fs.readFileSync(`/proc/${daemonPid}/stat`, 'utf8').split(') ').at(-1).split(' ')[19];
    const daemonStart = start();
    function unchanged() {
      for (const [file, digest] of hashes) check(fileHash(file) === digest, 'NODE_DUMP_OU_UNIDADE_MUDOU');
      check(start() === daemonStart && fs.readlinkSync(`/proc/${daemonPid}/exe`) === PM2_NODE, 'DAEMON_MUDOU');
      assertPreserved(initial, snapshotProcesses(list()));
    }
    preflight(env, bundle);
    run(NODE, ['-e', `if(typeof require('@aws-sdk/nested-clients/sts').AssumeRoleCommand!=='function'||typeof require('saxes').SaxesParser!=='function')process.exit(1)`], { cwd: BACKEND });
    check(await health(8000) && await health(8001), 'HEALTH_INICIAL_FALHOU');
    unchanged(); git(['merge', '--ff-only', version]);
    check(git(['rev-parse', 'HEAD']) === version, 'VERSAO_APLICADA_DIFERENTE');
    for (const args of [['--test', 'scripts/validarNsdocsCapturaDev.js', 'scripts/validarNsdocsSetupDev.js'],
      ['scripts/validarNsdocsManualDev.js'], ['scripts/validarNsdocsV2.js'],
      ['scripts/validarFilaEstornoPermissao.js'], ['--test', '../ops/deploy/atualizar-dev-nsdocs-captura-20261024.test.cjs']]) {
      run(NODE, args, { cwd: BACKEND }); console.log(`QA aprovado: ${args.at(-1)}`);
    }
    preflight(env, bundle);
    console.log('TLS_UUID_DEV_CONFERIDOS_EM_LEITURA');
    let diagnosis;
    try {
      const output = run(NODE, ['scripts/nsdocsDevSetup.js', '--conferir'], { cwd: BACKEND });
      diagnosis = JSON.parse(output.split(/\r?\n/).at(-1));
      check(diagnosis.outcome === 'NSDOCS_SETUP_DEV_CONFERIDO' && diagnosis.chamadas_nsdocs === 0,
        'CONFERENCIA_CAPTURA_DEV_INVALIDA');
    } catch (error) {
      if (/^NSDOCS_[A-Z0-9_]{1,95}$/.test(error.message || '')) throw error;
      check(false, 'CONFERENCIA_CAPTURA_DEV_FALHOU_SEM_EXIBIR_DADOS');
    }
    unchanged(); check(await health(8000) && await health(8001), 'HEALTH_FINAL_FALHOU');
    console.log(JSON.stringify({ etapa: 'NSDOCS_CAPTURA_DEV_ARQUIVOS_PRONTOS', commit: version,
      conector_automatico_desligado: true, chave_nao_configurada_pelo_deploy: true, chamadas_nsdocs: 0,
      tls_manual_com_ca_aws_validada: true,
      processos_nodes_ambientes_daemon_e_dumps_preservados: true }));
    console.log(JSON.stringify(diagnosis));
    console.log('Arquivos e QA prontos. Configuracao privada, IAM/S3, migration e captura sao etapas separadas. Sem restart/install ou alteracao do PM2.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { ROOT, NODE, PM2_NODE, PM2_CLI, BASE, CA_PATH, CHANGESET, cleanEnv, validateInventory,
  validatePackage, validateLock, validateFlags, validateCaBundle, assertPreserved, main };
if (require.main === module || process.argv[1] === '-') main(process.argv[2]).catch(error => {
  if (/^[A-Z][A-Z0-9_]{0,100}$/.test(error.message || '')) console.error(error.message);
  console.error('ATUALIZACAO_CAPTURA_DEV_INTERROMPIDA. Nao contorne protecoes; envie a saida sem segredos.');
  process.exitCode = 1;
});
