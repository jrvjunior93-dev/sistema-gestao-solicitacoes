const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const file = path.join(__dirname, 'atualizar-prod-download-medicao-backend-20261024.cjs');
const source = fs.readFileSync(file, 'utf8');
const manifest = require('./download-medicao-backend-prod-20261024.json');
const { validateProd, validateInventory, validatePackage, assertPeers, childEnvironment, BASE, NODE, ROOT } = require(file);
const good = () => ({ name: 'backend-solicitacoes', pm_id: 0, pid: 10, pm2_env: {
  status: 'online', exec_mode: 'fork_mode', watch: false, exec_interpreter: 'node',
  pm_cwd: `${ROOT}/backend`, pm_exec_path: `${ROOT}/backend/server.js`,
  env: { DEPLOYMENT_ENV: 'production' }, pm_uptime: 1, restart_time: 1
} });
const actual = { executable: NODE, version: 'v24.13.0' };
test('somente processo produtivo unico online fork no caminho e runtime esperados', () => {
  assert.equal(validateProd([good()], actual).pid, 10);
  for (const mutate of [p => { p.pm2_env.pm_cwd = '/dev/backend'; },
    p => { p.pm2_env.exec_interpreter = '/node-dev/bin/node'; }, p => { p.pm2_env.watch = true; },
    p => { p.pm2_env.status = 'stopped'; }, p => { p.pm2_env.exec_mode = 'cluster_mode'; }]) {
    const p = good(); mutate(p); assert.throws(() => validateProd([p], actual));
  }
  assert.throws(() => validateProd([good(), good()], actual));
  assert.throws(() => validateProd([good()], { ...actual, executable: '/node-dev/bin/node' }));
});
test('inventario exato e ausencia de frontend/migration/lockfile', () => {
  validateInventory(manifest, manifest.arquivos);
  assert.throws(() => validateInventory(manifest, manifest.arquivos.slice(1)));
  for (const p of ['frontend/src/a.js', 'backend/migrations/extra.js', 'backend/package-lock.json']) {
    const extra = `M\t${p}`;
    assert.throws(() => validateInventory(manifest, [...manifest.arquivos, extra]));
    assert.throws(() => validateInventory({ ...manifest, arquivos: [extra] }, [extra]));
  }
});
const before = { scripts: { start: 'node server.js' }, dependencies: { express: '4.22.3' } };
const after = () => ({ ...structuredClone(before), scripts: { ...before.scripts,
  'test:download-anexo-medicao': 'node scripts/validarDownloadAnexoMedicao.js && node scripts/validarRemocaoAnexosHistorico.js' } });
test('package somente script QA, sem dependencia/flag/permissao nova', () => {
  validatePackage(before, after());
  const bad = after(); bad.dependencies.express = '5'; assert.throws(() => validatePackage(before, bad));
});
test('preservar todos os peers e remover somente IPC herdado do filho', () => {
  assertPeers([{ pid: 1, runtime: 'v24.22.1' }], [{ pid: 1, runtime: 'v24.22.1' }]);
  assert.throws(() => assertPeers([{ pid: 1 }], [{ pid: 2 }]));
  assert.deepEqual(childEnvironment('DB_HOST=prod\0NODE_CHANNEL_FD=3\0NODE_CHANNEL_SERIALIZATION_MODE=json\0NODE_UNIQUE_ID=1\0NODE_OPTIONS=--enable-source-maps\0'),
    { DB_HOST: 'prod', NODE_OPTIONS: '--enable-source-maps' });
});
function scenario(failure) {
  const target = 'a'.repeat(40), calls = [], proofs = [];
  let head = failure === 'head' ? 'b'.repeat(40) : BASE, restarted = false, closed = false;
  const prod = good();
  const dev = { name: 'backend-dev', pm_id: 1, pid: 30, pm2_env: { status: 'online',
    exec_interpreter: '/node-dev/bin/node', pm_cwd: '/dev/backend', pm_exec_path: '/dev/backend/server.js', env: {} } };
  const result = stdout => ({ status: 0, stdout: stdout || '' });
  const fakeCp = { spawnSync(bin, args, options) {
    calls.push({ bin, args, options });
    if (bin === 'git') {
      if (args[0] === 'branch') return result('main');
      if (args[0] === 'status') return result('');
      if (args[0] === 'rev-parse') return result(args[1] === 'HEAD' ? head : args[1] === 'origin/main' ? target : `.git/${args[2]}`);
      if (args[0] === 'fetch') return result();
      if (args[0] === 'diff') return result(args.includes('--name-status') ? manifest.arquivos.join('\n') : '');
      if (args[0] === 'show') return result(JSON.stringify(args[1].endsWith(MANIFEST_NAME) ? manifest : args[1].startsWith(`${BASE}:`) ? before : after()));
      if (args[0] === 'merge') { head = target; return result(); }
      throw Error('GIT_NAO_PREVISTO');
    }
    if (bin === 'pm2') {
      if (args[0] === 'jlist') return result(JSON.stringify([prod, dev]));
      assert.deepEqual(Array.from(args), ['restart', '0']);
      restarted = true; prod.pid = 20;
      if (failure === 'dev') dev.pid++;
      if (failure === 'env') prod.pm2_env.env = { ALTERADO: 'true' };
      return result();
    }
    if (bin === 'systemctl') return failure === 'timer' ? { status: 3, stdout: '' } : result();
    if (bin.startsWith('/proc/')) return result(restarted && failure === 'runtime' ? 'v24.22.1' : bin.includes('/30/') ? 'v24.22.1' : 'v24.13.0');
    assert.equal(bin, NODE);
    if (args[0] === '-e') {
      assert.equal(options.cwd, `${ROOT}/backend`);
      assert.equal(options.env.NODE_CHANNEL_FD, undefined);
      return failure === 'preflight' ? { status: 70, stdout: '' } : result();
    }
    if (args[0].startsWith('scripts/') && failure === 'qa') return { status: 1, stdout: '' };
    return result();
  } };
  const fakeFs = {
    realpathSync: x => x, mkdirSync() {}, rmdirSync() { closed = true; }, existsSync: () => true,
    readFileSync: file => file.endsWith('/environ') ? 'DEPLOYMENT_ENV=production\0NODE_CHANNEL_FD=3\0' : 'conteudo-estavel',
    readlinkSync: file => file.includes('/30/') || file.includes('/31/') ? '/node-dev/bin/node' : NODE,
    writeFileSync: (_file, data) => proofs.push(JSON.parse(data))
  };
  const fakeHttp = { get(options, callback) {
    const req = new EventEmitter(); req.destroy = () => req.emit('error', Error('timeout'));
    queueMicrotask(() => {
      const res = new EventEmitter(); res.setEncoding = () => {};
      res.statusCode = restarted && failure === 'health' && options.port === 8000 ? 503 : 200;
      callback(res); res.emit('data', '{"ok":true}'); res.emit('end');
    });
    return req;
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { platform: 'linux', cwd: () => ROOT,
    argv: ['node', 'test'], env: { CONFIRM_PROD_BACKUP: 'SIM', CONFIRM_PROD_BACKUP_TIMER: 'SIM' } },
    require: name => ({ 'node:fs': fakeFs, 'node:child_process': fakeCp, 'node:http': fakeHttp,
      'node:assert/strict': { deepEqual(a, b, message) {
        // Apenas adaptar prototipos cruzando a VM do teste; valores integrais.
        assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), message);
      } }
    })[name] || require(name),
    console: { log() {}, error() {} }, setTimeout: cb => queueMicrotask(cb), structuredClone }, { filename: file });
  return { run: () => module.exports.main(target), calls, proofs, restarted: () => restarted, closed: () => closed };
}
const MANIFEST_NAME = 'ops/deploy/download-medicao-backend-prod-20261024.json';
test('orquestracao completa: preflight/FF/QA/restart PROD/health/prova; DEV preservado', async () => {
  const s = scenario(); await s.run();
  assert(s.closed()); assert(s.restarted()); assert.equal(s.proofs.length, 1);
  assert.equal(s.proofs[0].etapa, 'BACKEND_DOWNLOAD_MEDICAO_PRODUCAO_PRONTO');
  assert.equal(s.proofs[0].node_producao, 'v24.13.0');
  assert.equal(s.proofs[0].pid_dev, 30); assert.equal(s.proofs[0].frontend_novo_publicado, false);
  const ff = s.calls.findIndex(c => c.bin === 'git' && c.args[0] === 'merge');
  const qa = s.calls.findIndex(c => c.args[0] === 'scripts/validarDownloadAnexoMedicao.js');
  const restart = s.calls.findIndex(c => c.bin === 'pm2' && c.args[0] === 'restart');
  assert(ff < qa && qa < restart);
});
test('timer/head/preflight/QA falham antes do restart; nunca emitem prova', async () => {
  for (const f of ['timer', 'head', 'preflight', 'qa']) {
    const s = scenario(f); await assert.rejects(s.run());
    assert(!s.restarted(), f); assert(s.closed(), f); assert.equal(s.proofs.length, 0);
  }
});
test('DEV/runtime/env/health alterados apos restart bloqueiam prova e frontend', async () => {
  for (const f of ['dev', 'runtime', 'env', 'health']) {
    const s = scenario(f); await assert.rejects(s.run());
    assert(s.restarted(), f); assert(s.closed(), f); assert.equal(s.proofs.length, 0);
  }
});
test('runner nao aplica DDL, dependencias, Node, pm2 all ou ambiente', () => {
  assert(source.includes("run('pm2', ['restart', String(p.pm_id)]"));
  assert(!source.includes('--update-env'));
  assert(!/run\('(?:npm|sudo)'|\.runMigrations\(|\.sync\(/.test(source));
  assert(source.includes('assertMigrationsUpToDate()'));
  assert(source.includes('fluxy-prod-db-backup.timer'));
});
