'use strict';

// Operador exclusivo DEV. Ler do commit publicado: git show SHA:este/arquivo | NODE - SHA.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), http = require('node:http');
const { isDeepStrictEqual } = require('node:util');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-dev';
const BACKEND = `${ROOT}/backend`;
const NODE = '/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node';
const PM2_NODE = '/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const PM2_CLI = '/usr/lib/node_modules/pm2/bin/pm2';
const BASE = '59891d254edb8fac0a5b6cc22a6d5ef58c9441a7';
const CHANGESET = [
  'M\tbackend/.env.example', 'M\tbackend/package.json',
  'M\tbackend/src/modules/fiscal/routes/index.js', 'M\tdocs/modulos/fiscal/README.md',
  'A\tbackend/scripts/validarNsdocsV2.js',
  'A\tbackend/src/modules/fiscal/controllers/FiscalNsdocsController.js',
  ...['config.js', 'contract.js', 'normalize.js', 'connector.js', 'fixtures/documents.js']
    .map(file => `A\tbackend/src/modules/fiscal/services/nsdocs/${file}`),
  'A\tdocs/modulos/fiscal/NSDOCS_API_V2_BASE.md',
  'A\tdocs/handoffs/2026-10-24-nsdocs-v2-base-offline.md',
  'A\tdocs/handoffs/2026-10-24-publicacao-nsdocs-v2-dev.md',
  'A\tops/deploy/README-nsdocs-v2-dev-20261024.md',
  'A\tops/deploy/atualizar-dev-nsdocs-v2-20261024.cjs',
  'A\tops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs'
];
function check(ok, code) { if (!ok) throw Error(code); }
const cleanEnv = () => ({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/home/ubuntu',
  USER: 'ubuntu', LOGNAME: 'ubuntu', LANG: 'C', PM2_HOME: '/home/ubuntu/.pm2' });
function run(bin, args, options = {}) {
  const result = cp.spawnSync(bin, args, { cwd: ROOT, env: cleanEnv(), encoding: 'utf8',
    timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  check(!result.error && result.status === 0, `COMANDO_FALHOU_${path.basename(bin).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${result.status ?? 'SEM_SAIDA'}`);
  return result.stdout.trim();
}
const git = args => run('git', args);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
const envHash = value => hash(JSON.stringify(stable(value)));
const pm2 = args => run(PM2_NODE, [PM2_CLI, ...args]);
function list() {
  // Nunca iniciar daemon implicitamente caso esteja indisponivel.
  const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim());
  check(pid > 1 && fs.readlinkSync(`/proc/${pid}/exe`) === PM2_NODE, 'DAEMON_PM2_ISOLADO_INDISPONIVEL');
  return JSON.parse(pm2(['jlist']));
}
function runtime(p) {
  return { executable: fs.readlinkSync(`/proc/${p.pid}/exe`),
    version: run(`/proc/${p.pid}/exe`, ['--version']) };
}
function validateDev(processes, actual) {
  const matches = processes.filter(p => p.name === 'backend-dev');
  check(matches.length === 1, 'DEV_NAO_UNICO');
  const p = matches[0], e = p.pm2_env || {};
  check(Number.isSafeInteger(p.pm_id) && p.pid > 0 && e.status === 'online', 'DEV_NAO_ONLINE');
  check(e.pm_exec_path === `${BACKEND}/server.js` && e.pm_cwd === BACKEND, 'PM2_DEV_CAMINHO_DIFERENTE');
  check(e.exec_mode === 'fork_mode' && (!e.watch || Array.isArray(e.watch) && !e.watch.length), 'MODO_DEV_DIFERENTE');
  check(e.exec_interpreter === NODE && actual.executable === NODE && actual.version === 'v24.22.1', 'NODE_ISOLADO_DEV_DIFERENTE');
  return p;
}
function validateInventory(diff) {
  check(isDeepStrictEqual([...diff].sort(), [...CHANGESET].sort()), 'INVENTARIO_FORA_DO_ESCOPO_NSDOCS');
}
function validatePackage(before, after) {
  const candidate = structuredClone(after);
  for (const [key, value] of Object.entries({
    'test:nsdocs-v2': 'node scripts/validarNsdocsV2.js',
    'test:deploy-nsdocs-dev': 'node --test ../ops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs'
  })) {
    check(before.scripts[key] === undefined && candidate.scripts[key] === value, 'SCRIPT_QA_NSDOCS_DIFERENTE');
    delete candidate.scripts[key];
  }
  check(isDeepStrictEqual(before, candidate), 'DEPENDENCIAS_OU_SCRIPTS_FORA_DO_ESCOPO');
}
function validateDisabled(env) {
  for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    check(env[key] === undefined || env[key] === '' || env[key] === 'false', 'NSDOCS_DEVE_CONTINUAR_DESLIGADO');
  }
}
function devPolicy(p) {
  const e = p.pm2_env;
  return { id: p.pm_id, name: p.name, cwd: e.pm_cwd, script: e.pm_exec_path,
    interpreter: e.exec_interpreter, mode: e.exec_mode, watch: e.watch,
    args: e.args, nodeArgs: e.node_args, env: envHash(e.env || {}) };
}
function peers(processes) {
  for (const name of ['backend-solicitacoes', 'fluxy-experience-api']) {
    check(processes.filter(p => p.name === name).length === 1 &&
      processes.find(p => p.name === name).pm2_env.status === 'online', 'PROCESSO_PROTEGIDO_NAO_ONLINE');
  }
  return processes.filter(p => p.name !== 'backend-dev').map(p => {
    const e = p.pm2_env, envFile = e.pm_cwd && path.join(e.pm_cwd, '.env');
    return { policy: devPolicy(p), pid: p.pid, status: e.status, uptime: e.pm_uptime,
      restarts: e.restart_time, environmentFile: envFile && fs.existsSync(envFile) ? fileHash(envFile) : null,
      runtime: p.pid > 0 ? runtime(p) : null };
  }).sort((a, b) => a.policy.id - b.policy.id);
}
function assertPeers(before, after) { check(isDeepStrictEqual(before, after), 'PROCESSO_FORA_DO_DEV_MUDOU'); }
function effectiveEnv(p) {
  const env = Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8').split('\0')
    .filter(Boolean).map(pair => { const index = pair.indexOf('='); return [pair.slice(0, index), pair.slice(index + 1)]; }));
  for (const key of ['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID']) delete env[key];
  return env;
}
function probe(p, connectorAvailable) {
  const env = effectiveEnv(p);
  validateDisabled(env); validateDisabled(p.pm2_env); validateDisabled(p.pm2_env.env || {});
  const code = `
    const fs = require('node:fs');
    const stored = require('dotenv').parse(fs.readFileSync('.env'));
    for (const item of [process.env, stored]) for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
      if (item[key] !== undefined && item[key] !== '' && item[key] !== 'false') process.exit(70);
    }
    const { env, validateRequiredEnv } = require('./src/config/env'); validateRequiredEnv();
    if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001 ||
        env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' ||
        /^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) process.exit(71);
    if (${Boolean(connectorAvailable)}) {
      const result = require('./src/modules/fiscal/services/nsdocs/config').getDiagnostics();
      if (result.enabled || !result.configuration_valid || result.mode !== 'disabled' || result.real_calls_available) process.exit(72);
    }
    const db = require('./src/database');
    (async () => {
      const [[identity]] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
      if (identity.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || identity.banco !== 'gestao_solicitacoes') throw Error('DB_DEV');
      await require('./src/database/runMigrations').assertMigrationsUpToDate();
    })().catch(() => { process.exitCode = 73; }).finally(() => db.close());
  `;
  // Saidas capturadas e jamais impressas: nenhum segredo, SQL ou erro bruto no terminal.
  run(NODE, ['-e', code], { cwd: BACKEND, env, timeout: 45000 });
}
function health(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', data => { body += data; if (body.length > 4096) req.destroy(); });
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); } });
      res.on('error', () => resolve(false));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
async function main(version) {
  check(process.platform === 'linux' && process.getuid() === 1000 && /^[0-9a-f]{40}$/.test(version || ''), 'EXIGE_UBUNTU_E_SHA_COMPLETO');
  check(fs.realpathSync(ROOT) === ROOT && fs.realpathSync(process.cwd()) === ROOT, 'DIRETORIO_DEV_DIFERENTE');
  check(git(['rev-parse', '--show-toplevel']) === ROOT && git(['branch', '--show-current']) === 'refactor/frontend', 'BRANCH_DEV_DIFERENTE');
  check(!git(['status', '--porcelain', '--untracked-files=no']), 'DEV_TEM_ARQUIVOS_RASTREADOS_ALTERADOS');
  check([BASE, version].includes(git(['rev-parse', 'HEAD'])), 'ETAPA_DEV_ANTERIOR_PENDENTE');
  git(['merge-base', '--is-ancestor', version, 'origin/refactor/frontend']);
  validateInventory(git(['diff', '--name-status', BASE, version]).split(/\r?\n/).filter(Boolean));
  validatePackage(JSON.parse(git(['show', `${BASE}:backend/package.json`])), JSON.parse(git(['show', `${version}:backend/package.json`])));
  const lock = path.resolve(ROOT, git(['rev-parse', '--git-path', 'nsdocs-v2-dev-operacao.lock']));
  fs.mkdirSync(lock, { mode: 0o700 });
  try {
    const processes = list(), candidate = processes.find(p => p.name === 'backend-dev');
    check(candidate, 'DEV_AUSENTE');
    const p = validateDev(processes, runtime(candidate)), policy = devPolicy(p), protectedPeers = peers(processes);
    const files = [`${BACKEND}/.env`, '/usr/bin/node', NODE, PM2_NODE, PM2_CLI,
      '/home/ubuntu/.pm2/dump.pm2', '/home/ubuntu/.pm2/dump.pm2.bak',
      '/etc/systemd/system/pm2-ubuntu.service', '/home/ubuntu/.pm2/pm2.pid'];
    const hashes = files.map(file => [file, fileHash(file)]);
    const daemonPid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8'));
    const daemonStart = fs.readFileSync(`/proc/${daemonPid}/stat`, 'utf8');
    const startTicks = stat => stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    function unchanged() {
      for (const [file, digest] of hashes) check(fileHash(file) === digest, 'ENV_RUNTIME_DUMP_OU_UNIDADE_MUDOU');
      check(fs.readlinkSync(`/proc/${daemonPid}/exe`) === PM2_NODE &&
        startTicks(fs.readFileSync(`/proc/${daemonPid}/stat`, 'utf8')) === startTicks(daemonStart), 'DAEMON_MUDOU');
      assertPeers(protectedPeers, peers(list()));
    }
    probe(p, git(['rev-parse', 'HEAD']) === version);
    check(await health(8000) && await health(8001), 'HEALTH_INICIAL_FALHOU');
    unchanged();
    git(['merge', '--ff-only', version]);
    check(git(['rev-parse', 'HEAD']) === version, 'VERSAO_APLICADA_DIFERENTE');
    for (const args of [
      ['scripts/validarNsdocsV2.js'], ['scripts/validarFilaEstornoPermissao.js'],
      ['--test', '../ops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs']
    ]) {
      run(NODE, args, { cwd: BACKEND, timeout: 45000 });
      console.log(`QA aprovado: ${args.at(-1)}`);
    }
    const active = list().find(item => item.name === 'backend-dev');
    check(active && active.pid === p.pid && isDeepStrictEqual(devPolicy(active), policy), 'DEV_MUDOU_DURANTE_PREFLIGHT');
    probe(active, true); unchanged();
    console.log('Reiniciando SOMENTE backend-dev; Node isolado e ambiente preservados.');
    pm2(['restart', String(p.pm_id)]);
    let ready, stablePid, consecutive = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      unchanged();
      const current = list(), item = current.find(item => item.name === 'backend-dev');
      if (item?.pid > 0 && item.pid !== p.pid && item.pm2_env.status === 'online' && await health(8001)) {
        ready = validateDev(current, runtime(item));
        check(isDeepStrictEqual(devPolicy(ready), policy), 'POLITICA_DEV_MUDOU');
        consecutive = item.pid === stablePid ? consecutive + 1 : 1;
        stablePid = item.pid;
        if (consecutive >= 4) break;
      } else consecutive = 0;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    check(ready && consecutive >= 4, 'DEV_NAO_ESTABILIZOU');
    probe(ready, true); unchanged(); check(await health(8000), 'HEALTH_PRODUCAO_FALHOU');
    console.log(JSON.stringify({ etapa: 'NSDOCS_V2_DEV_OFFLINE_PRONTO', commit: version,
      node_dev: runtime(ready), pid_dev: ready.pid, conector_desligado: true,
      fixtures_somente_no_qa: true, producao_experience_daemon_e_dumps_preservados: true }));
    console.log('Sem migration, npm install, chave, chamadas NSDOCS, frontend, update-env ou pm2 save/update/resurrect.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { ROOT, NODE, PM2_NODE, BASE, CHANGESET, cleanEnv, validateDev, validateInventory,
  validatePackage, validateDisabled, devPolicy, assertPeers, main };
if (require.main === module || process.argv[1] === '-') main(process.argv[2]).catch(error => {
  if (/^[A-Z][A-Z0-9_]{0,100}$/.test(error.message || '')) console.error(error.message);
  console.error('ATUALIZACAO_NSDOCS_DEV_INTERROMPIDA. Nao contorne protecoes nem reinicie outros processos.');
  console.error('Confira branch/etapa pendente, flags NSDOCS desligadas, schema e Nodes isolados sem expor segredos.');
  process.exitCode = 1;
});
