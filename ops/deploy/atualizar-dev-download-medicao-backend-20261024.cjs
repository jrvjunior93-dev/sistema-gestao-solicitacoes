'use strict';
// Exclusivo backend DEV. Pode ser lido por git show e executado com node - SHA.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), http = require('node:http'), assert = require('node:assert/strict');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-dev';
const BACKEND = `${ROOT}/backend`;
const NODE = '/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node';
const BASE = '84b9aef43fe2f3192bdcf0e415dd794289b0f751';
const MANIFEST = 'ops/deploy/download-medicao-backend-20261024.json';
function check(ok, code) { if (!ok) throw Error(code); }
function run(bin, args, options = {}) {
  const r = cp.spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 30000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  check(!r.error && r.status === 0,
    `COMANDO_FALHOU:${path.basename(bin)}:saida=${r.status ?? 'nenhuma'}:sinal=${r.signal || 'nenhum'}`);
  return r.stdout.trim();
}
const git = args => run('git', args);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const list = () => JSON.parse(run('pm2', ['jlist']));
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
  check(e.exec_interpreter === NODE && actual.executable === NODE && actual.version === 'v24.22.1',
    'NODE_ISOLADO_DEV_DIFERENTE');
  return p;
}
function validateInventory(manifest, diff) {
  check(manifest.base === BASE, 'BASE_MANIFESTO_DIFERENTE');
  check(manifest.arquivos.every(line => !line.split('\t')[1].startsWith('frontend/')), 'FRONTEND_NA_ETAPA_BACKEND');
  assert.deepEqual([...diff].sort(), [...manifest.arquivos].sort(), 'INVENTARIO_FORA_DO_ESCOPO');
}
function validatePackage(before, after) {
  const expected = structuredClone(after);
  check(!before.scripts['test:download-anexo-medicao'], 'SCRIPT_QA_JA_EXISTIA');
  check(expected.scripts['test:download-anexo-medicao'] ===
    'node scripts/validarDownloadAnexoMedicao.js && node scripts/validarRemocaoAnexosHistorico.js', 'SCRIPT_QA_DIFERENTE');
  delete expected.scripts['test:download-anexo-medicao'];
  assert.deepEqual(expected, before, 'DEPENDENCIAS_OU_SCRIPTS_FORA_DO_ESCOPO');
}
function peers(processes) {
  check(processes.filter(p => p.name === 'backend-solicitacoes').length === 1, 'PRODUCAO_NAO_UNICA');
  check(processes.find(p => p.name === 'backend-solicitacoes').pm2_env.status === 'online', 'PRODUCAO_NAO_ONLINE');
  return processes.filter(p => p.name !== 'backend-dev').map(p => {
    const e = p.pm2_env, envPath = e.pm_cwd && path.join(e.pm_cwd, '.env');
    return { name: p.name, id: p.pm_id, pid: p.pid, status: e.status,
      uptime: e.pm_uptime, restarts: e.restart_time, interpreter: e.exec_interpreter,
      script: e.pm_exec_path, cwd: e.pm_cwd, envHash: hash(JSON.stringify(e.env || {})),
      envFileHash: envPath && fs.existsSync(envPath) ? fileHash(envPath) : null,
      runtime: p.pid > 0 ? runtime(p) : null };
  }).sort((a, b) => a.id - b.id);
}
function assertPeers(before, after) { assert.deepEqual(after, before, 'PROCESSO_FORA_DO_DEV_MUDOU'); }
function validateEnv(p) {
  const effective = Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8')
    .split('\0').filter(Boolean).map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
  // Nao herdar o canal IPC do PM2 em um filho sem esse descritor.
  for (const key of ['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID']) delete effective[key];
  run(NODE, ['-e', `
    const { env } = require('./src/config/env');
    if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001 ||
        env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com' ||
        /^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) process.exit(70);
  `], { cwd: BACKEND, env: effective });
}
function health(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', b => { body += b; if (body.length > 4096) req.destroy(); });
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); } });
      res.on('error', () => resolve(false));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
async function main(version) {
  check(process.platform === 'linux' && /^[0-9a-f]{40}$/.test(version || ''), 'EXIGE_LINUX_E_SHA_COMPLETO');
  check(fs.realpathSync(ROOT) === ROOT && process.cwd() === ROOT, 'DIRETORIO_DEV_DIFERENTE');
  check(git(['branch', '--show-current']) === 'refactor/frontend', 'BRANCH_DEV_DIFERENTE');
  check(!git(['status', '--porcelain', '--untracked-files=no']), 'DEV_TEM_ARQUIVOS_RASTREADOS_ALTERADOS');
  const lock = path.resolve(ROOT, git(['rev-parse', '--git-path', 'download-medicao-dev-operacao.lock']));
  fs.mkdirSync(lock, { mode: 0o700 });
  try {
    const initial = list();
    const candidate = initial.find(p => p.name === 'backend-dev');
    check(candidate, 'DEV_AUSENTE');
    const p = validateDev(initial, runtime(candidate)), protectedPeers = peers(initial);
    validateEnv(p);
    check(await health(8000) && await health(8001), 'HEALTH_INICIAL_FALHOU');
    const original = { env: fileHash(`${BACKEND}/.env`), node: fileHash('/usr/bin/node'), isolated: fileHash(NODE) };
    function unchanged() {
      check(fileHash(`${BACKEND}/.env`) === original.env && fileHash('/usr/bin/node') === original.node
        && fileHash(NODE) === original.isolated, 'ENV_OU_NODE_MUDOU');
      assertPeers(protectedPeers, peers(list()));
    }
    git(['fetch', 'origin', 'refactor/frontend']);
    git(['merge-base', '--is-ancestor', version, 'origin/refactor/frontend']);
    check(git(['rev-parse', 'origin/refactor/frontend']) === version,
      'REMOTO_AVANCOU: confirme a etapa backend antes de continuar.');
    const head = git(['rev-parse', 'HEAD']);
    check([BASE, version].includes(head), 'HEAD_DEV_FORA_DA_ETAPA_BACKEND');
    const show = file => git(['show', `${version}:${file}`]);
    const manifest = JSON.parse(show(MANIFEST));
    validateInventory(manifest, git(['diff', '--name-status', BASE, version]).split(/\r?\n/).filter(Boolean));
    validatePackage(JSON.parse(git(['show', `${BASE}:backend/package.json`])), JSON.parse(show('backend/package.json')));
    check(!git(['diff', '--name-only', BASE, version, '--', 'backend/migrations', 'backend/package-lock.json', 'frontend']),
      'MIGRATION_DEPENDENCIA_OU_FRONTEND_NAO_AUTORIZADO');
    unchanged();
    git(['merge', '--ff-only', version]);
    check(git(['rev-parse', 'HEAD']) === version, 'VERSAO_APLICADA_DIFERENTE');
    for (const file of ['src/controllers/AnexoController.js', 'src/services/s3.js', 'src/utils/fileName.js',
      'src/services/fileAccessService.js', 'src/validators/securityValidators.js']) run(NODE, ['--check', file], { cwd: BACKEND });
    for (const file of ['validarDownloadAnexoMedicao.js', 'validarRemocaoAnexosHistorico.js', 'validarAcessoAnexosSolicitacoes.js']) {
      run(NODE, [`scripts/${file}`], { cwd: BACKEND, timeout: 120000 });
      console.log(`QA aprovado: ${file}`);
    }
    unchanged();
    const current = validateDev(list(), runtime(p));
    check(current.pm_id === p.pm_id && current.pid === p.pid, 'DEV_MUDOU_DURANTE_PREFLIGHT');
    validateEnv(current);
    console.log('Reiniciando SOMENTE backend-dev, mantendo Node24.22.1 isolado e ambiente.');
    run('pm2', ['restart', String(p.pm_id)], { timeout: 60000 });
    let stablePid, consecutive = 0, ready;
    for (let attempt = 0; attempt < 25; attempt++) {
      unchanged();
      const processes = list(), active = processes.find(p => p.name === 'backend-dev');
      if (active?.pm2_env.status === 'online' && active.pid > 0 && active.pid !== p.pid && await health(8001)) {
        ready = validateDev(processes, runtime(active));
        consecutive = active.pid === stablePid ? consecutive + 1 : 1;
        stablePid = active.pid;
        if (consecutive >= 6) break;
      } else { consecutive = 0; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    check(ready && consecutive >= 6, 'DEV_NAO_ESTABILIZOU: nao publique o frontend.');
    unchanged(); check(await health(8000), 'HEALTH_PRODUCAO_FALHOU');
    const proof = { etapa: 'BACKEND_DOWNLOAD_MEDICAO_PRONTO', commit: version,
      node_dev: runtime(ready).version, pid_dev: ready.pid,
      pid_producao: protectedPeers.find(p => p.name === 'backend-solicitacoes').pid,
      producao_preservada: true, frontend_novo_publicado: false };
    const proofPath = path.resolve(ROOT, git(['rev-parse', '--git-path', 'download-medicao-backend-pronto.json']));
    fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(proof));
    console.log('Sem migration/npm install/pm2 save/Node global. Envie esta saida ANTES de liberar o frontend.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { validateDev, validateInventory, validatePackage, assertPeers, BASE, NODE, ROOT };
if (require.main === module || process.argv[1] === '-') {
  main(process.argv[2]).catch(error => {
    console.error(error.message);
    console.error('Atualizacao DEV interrompida. Nao publique frontend nem contorne protecoes; envie a saida sem segredos.');
    process.exitCode = 1;
  });
}
