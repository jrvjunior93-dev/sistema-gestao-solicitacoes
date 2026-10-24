'use strict';
// Operador PROD: backend primeiro, sem DDL, instalacao ou troca de runtime.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), http = require('node:http'), assert = require('node:assert/strict');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main';
const BACKEND = `${ROOT}/backend`, NODE = '/usr/bin/node';
const BASE = '78fbf27749ca41f3ab01a25a968d05306c3bbb47';
const MANIFEST = 'ops/deploy/download-medicao-backend-prod-20261024.json';
function check(ok, code) { if (!ok) throw Error(code); }
function run(bin, args, options = {}) {
  const r = cp.spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 60000,
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
function validateProd(processes, actual) {
  const matches = processes.filter(p => p.name === 'backend-solicitacoes');
  check(matches.length === 1, 'PRODUCAO_NAO_UNICA');
  const p = matches[0], e = p.pm2_env || {};
  check(Number.isSafeInteger(p.pm_id) && p.pid > 0 && e.status === 'online', 'PRODUCAO_NAO_ONLINE');
  check(e.pm_exec_path === `${BACKEND}/server.js` && e.pm_cwd === BACKEND, 'PM2_PRODUCAO_CAMINHO_DIFERENTE');
  check(e.exec_mode === 'fork_mode' && (!e.watch || Array.isArray(e.watch) && !e.watch.length), 'MODO_PRODUCAO_DIFERENTE');
  check(['node', NODE].includes(e.exec_interpreter) && actual.executable === NODE && /^v24\./.test(actual.version),
    'NODE_PRODUCAO_DIFERENTE');
  return p;
}
function validateInventory(manifest, diff) {
  check(manifest.base === BASE, 'BASE_MANIFESTO_DIFERENTE');
  check(manifest.arquivos.every(line => {
    const file = line.split('\t')[1];
    return file && !file.startsWith('frontend/') && !file.startsWith('backend/migrations/') && !file.endsWith('lock.json');
  }), 'FRONTEND_MIGRATION_OU_LOCK_NA_ETAPA_BACKEND');
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
  check(processes.filter(p => p.name === 'backend-dev').length === 1, 'DEV_NAO_UNICO');
  check(processes.find(p => p.name === 'backend-dev').pm2_env.status === 'online', 'DEV_NAO_ONLINE');
  return processes.filter(p => p.name !== 'backend-solicitacoes').map(p => {
    const e = p.pm2_env, envPath = e.pm_cwd && path.join(e.pm_cwd, '.env');
    return { name: p.name, id: p.pm_id, pid: p.pid, status: e.status,
      uptime: e.pm_uptime, restarts: e.restart_time, interpreter: e.exec_interpreter,
      script: e.pm_exec_path, cwd: e.pm_cwd, envHash: hash(JSON.stringify(e.env || {})),
      envFileHash: envPath && fs.existsSync(envPath) ? fileHash(envPath) : null,
      runtime: p.pid > 0 ? runtime(p) : null };
  }).sort((a, b) => a.id - b.id);
}
function assertPeers(before, after) { assert.deepEqual(after, before, 'DEV_OU_OUTRO_PROCESSO_MUDOU'); }
function childEnvironment(raw) {
  const effective = Object.fromEntries(raw.split('\0').filter(Boolean)
    .map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
  for (const key of ['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID']) delete effective[key];
  return effective;
}
function validateEnv(p) {
  const effective = childEnvironment(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8'));
  // Helper canonico: configuracao real/.env/PM2, UUID, TLS, JSON, flags e 12h.
  // Apenas SELECT de identidade/schema, sem importar modelos ou aplicar DDL.
  run(NODE, ['-e', `
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('./src/config/env');
    const db = require('./src/database');
    (async () => {
      try {
        await require('./scripts/promoverSchemaProducao20261018').conferirProducao({
          cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
          execFileSync: cp.execFileSync, runtimeEnv: process.env
        });
        await require('./src/database/runMigrations').assertMigrationsUpToDate();
      } finally { await db.close(); }
    })().catch(() => { console.error('PREFLIGHT_PRODUCAO_FALHOU'); process.exitCode = 1; });
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
  check(process.env.CONFIRM_PROD_BACKUP === 'SIM' && process.env.CONFIRM_PROD_BACKUP_TIMER === 'SIM', 'BACKUP_TIMER_NAO_CONFIRMADOS');
  check(fs.realpathSync(ROOT) === ROOT && process.cwd() === ROOT, 'DIRETORIO_PRODUCAO_DIFERENTE');
  check(git(['branch', '--show-current']) === 'main', 'BRANCH_PRODUCAO_DIFERENTE');
  check(!git(['status', '--porcelain', '--untracked-files=no']), 'PRODUCAO_TEM_ARQUIVOS_RASTREADOS_ALTERADOS');
  const lock = path.resolve(ROOT, git(['rev-parse', '--git-path', 'download-medicao-prod-operacao.lock']));
  fs.mkdirSync(lock, { mode: 0o700 });
  try {
    run('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
    const initial = list(), candidate = initial.find(p => p.name === 'backend-solicitacoes');
    check(candidate, 'PRODUCAO_AUSENTE');
    const oldRuntime = runtime(candidate), p = validateProd(initial, oldRuntime), protectedPeers = peers(initial);
    const oldEnvHash = hash(JSON.stringify(p.pm2_env.env || {}));
    validateEnv(p);
    check(await health(8000) && await health(8001), 'HEALTH_INICIAL_FALHOU');
    const original = { env: fileHash(`${BACKEND}/.env`), node: fileHash(NODE) };
    function unchanged() {
      check(fileHash(`${BACKEND}/.env`) === original.env && fileHash(NODE) === original.node, 'ENV_OU_NODE_MUDOU');
      assertPeers(protectedPeers, peers(list()));
    }
    git(['fetch', 'origin', 'main']);
    check(git(['rev-parse', 'origin/main']) === version, 'REMOTO_MAIN_AVANCOU');
    check([BASE, version].includes(git(['rev-parse', 'HEAD'])), 'HEAD_PRODUCAO_FORA_DA_ETAPA_BACKEND');
    const show = file => git(['show', `${version}:${file}`]);
    validateInventory(JSON.parse(show(MANIFEST)), git(['diff', '--name-status', BASE, version]).split(/\r?\n/).filter(Boolean));
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
    const current = validateProd(list(), runtime(p));
    check(current.pm_id === p.pm_id && current.pid === p.pid, 'PRODUCAO_MUDOU_DURANTE_PREFLIGHT');
    validateEnv(current);
    run('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
    console.log('Reiniciando SOMENTE backend-solicitacoes, preservando Node e ambiente.');
    run('pm2', ['restart', String(p.pm_id)]);
    let stablePid, consecutive = 0, ready;
    for (let attempt = 0; attempt < 25; attempt++) {
      unchanged();
      const processes = list(), active = processes.find(p => p.name === 'backend-solicitacoes');
      if (active?.pm2_env.status === 'online' && active.pid > 0 && active.pid !== p.pid && await health(8000)) {
        ready = validateProd(processes, runtime(active));
        assert.deepEqual(runtime(ready), oldRuntime, 'RUNTIME_PRODUCAO_MUDOU');
        check(hash(JSON.stringify(ready.pm2_env.env || {})) === oldEnvHash, 'AMBIENTE_PM2_PRODUCAO_MUDOU');
        consecutive = active.pid === stablePid ? consecutive + 1 : 1;
        stablePid = active.pid;
        if (consecutive >= 6) break;
      } else { consecutive = 0; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    check(ready && consecutive >= 6, 'PRODUCAO_NAO_ESTABILIZOU: nao publique frontend.');
    validateEnv(ready);
    unchanged(); check(await health(8001), 'HEALTH_DEV_FALHOU');
    run('systemctl', ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
    const proof = { etapa: 'BACKEND_DOWNLOAD_MEDICAO_PRODUCAO_PRONTO', commit: version,
      node_producao: oldRuntime.version, pid_producao: ready.pid,
      pid_dev: protectedPeers.find(p => p.name === 'backend-dev').pid,
      dev_preservado: true, frontend_novo_publicado: false };
    const proofPath = path.resolve(ROOT, git(['rev-parse', '--git-path', 'download-medicao-prod-backend-pronto.json']));
    fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(proof));
    console.log('Sem migration/npm install/pm2 save/troca de Node. Envie a saida ANTES da publicacao frontend.');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { main, validateProd, validateInventory, validatePackage, assertPeers, childEnvironment, BASE, NODE, ROOT };
if (require.main === module || process.argv[1] === '-') {
  main(process.argv[2]).catch(error => {
    const code = String(error.message || '').split(/[:\n]/)[0];
    console.error('ATUALIZACAO_PRODUCAO_INTERROMPIDA:' + (/^[A-Z0-9_]+$/.test(code) ? code : 'FALHA_VALIDACAO_OU_COMANDO'));
    console.error('Envie a saida sem segredos. Nao contorne protecoes, force Git ou reinicie todos os processos.');
    process.exitCode = 1;
  });
}
