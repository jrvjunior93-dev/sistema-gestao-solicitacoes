const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { validateDev, validateInventory, validatePackage, assertPeers, NODE } =
  require('./atualizar-dev-download-medicao-backend-20261024.cjs');
const manifest = require('./download-medicao-backend-20261024.json');
const good = () => ({ name: 'backend-dev', pm_id: 1, pid: 90, pm2_env: { status: 'online',
  pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js',
  pm_cwd: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend', exec_mode: 'fork_mode',
  exec_interpreter: NODE, watch: false } });
const actual = { executable: NODE, version: 'v24.22.1' };
test('Node isolado obrigatorio; nao aceitar global, cluster, watch, path/producao ou duplicidade', () => {
  assert.equal(validateDev([good()], actual).pid, 90);
  for (const mutate of [p => { p.pm2_env.exec_interpreter = 'node'; },
    p => { p.pm2_env.pm_cwd = '/home/ubuntu/sistema-gestao-solicitacoes/backend'; },
    p => { p.pm2_env.exec_mode = 'cluster_mode'; }, p => { p.pm2_env.watch = true; },
    p => { p.pm2_env.status = 'errored'; }]) {
    const p = good(); mutate(p); assert.throws(() => validateDev([p], actual));
  }
  assert.throws(() => validateDev([good(), good()], actual));
  assert.throws(() => validateDev([good()], { ...actual, executable: '/usr/bin/node' }));
});
test('inventario aceita somente etapa backend e recusa arquivo/migration/frontend extra', () => {
  validateInventory(manifest, manifest.arquivos);
  assert.throws(() => validateInventory(manifest, [...manifest.arquivos, 'M\tfrontend/src/services/api.js']));
  assert.throws(() => validateInventory(manifest, [...manifest.arquivos, 'A\tbackend/migrations/nao.js']));
  assert.throws(() => validateInventory(manifest, manifest.arquivos.slice(1)));
  assert.throws(() => validateInventory({ ...manifest, arquivos: ['M\tfrontend/a.js'] }, ['M\tfrontend/a.js']));
});
test('package nao pode mudar dependencia, flags ou scripts anteriores', () => {
  const before = { scripts: { start: 'node server.js' }, dependencies: { express: '4.22.3' } };
  const after = structuredClone(before);
  after.scripts['test:download-anexo-medicao'] = 'node scripts/validarDownloadAnexoMedicao.js && node scripts/validarRemocaoAnexosHistorico.js';
  validatePackage(before, after);
  after.dependencies.express = '5.0.0'; assert.throws(() => validatePackage(before, after));
});
test('PID/restarts/configuracao de producao ou outro processo alterado impedem liberacao', () => {
  const before = [{ pid: 1, restarts: 2, interpreter: 'node', envHash: 'abc' }];
  assertPeers(before, structuredClone(before));
  for (const patch of [{ pid: 2 }, { restarts: 3 }, { envHash: 'xyz' }])
    assert.throws(() => assertPeers(before, [{ ...before[0], ...patch }]));
});
test('roteiro nao contem update de ambiente/global/PM2 all nem instalacao/migration', () => {
  const source = fs.readFileSync(path.join(__dirname, 'atualizar-dev-download-medicao-backend-20261024.cjs'), 'utf8');
  assert(source.includes("run('pm2', ['restart', String(p.pm_id)]"));
  assert(!source.includes('--update-env'));
  assert(!/run\('(?:npm|sudo)'/.test(source));
  assert(source.includes("'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID'"));
  assert(source.includes('BACKEND_DOWNLOAD_MEDICAO_PRONTO'));
});
