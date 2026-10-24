'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const operator = require('./atualizar-dev-nsdocs-v2-20261024.cjs');
const { ROOT, NODE, BASE, PM2_NODE, CHANGESET } = operator;
const VERSION = 'a'.repeat(40);
function app(name, id, pid, cwd, node) {
  return { name, pm_id: id, pid, pm2_env: { status: 'online', pm_cwd: cwd,
    pm_exec_path: `${cwd}/server.js`, exec_mode: 'fork_mode', watch: false,
    exec_interpreter: node, env: { PORT: name === 'backend-dev' ? '8001' : '8000' },
    pm_uptime: 1, restart_time: 0 } };
}
function fixture() {
  return [
    app('backend-dev', 1, 101, `${ROOT}/backend`, NODE),
    app('backend-solicitacoes', 0, 102, '/home/ubuntu/sistema-gestao-solicitacoes-main/backend', '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node'),
    app('fluxy-experience-api', 3, 103, '/home/ubuntu/fluxy-experience/api', '/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node')
  ];
}
function packages() {
  const before = { name: 'backend', scripts: { test: 'test-anterior' }, dependencies: { express: '4.0.0' } };
  const after = structuredClone(before);
  after.scripts['test:nsdocs-v2'] = 'node scripts/validarNsdocsV2.js';
  after.scripts['test:deploy-nsdocs-dev'] = 'node --test ../ops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs';
  return { before, after };
}

test('inventario exige exatamente pacote NSDOCS; migrations/frontend/env real nao entram', () => {
  operator.validateInventory(CHANGESET);
  for (const extra of ['A\tbackend/migrations/nova.js', 'M\tfrontend/src/main.jsx', 'M\tbackend/.env']) {
    assert.throws(() => operator.validateInventory([...CHANGESET, extra]));
  }
  assert.throws(() => operator.validateInventory(CHANGESET.slice(1)));
});
test('package permite so dois scripts; impede mudanca de dependencia ou script anterior', () => {
  const { before, after } = packages();
  operator.validatePackage(before, after);
  for (const mutate of [p => { p.dependencies.express = '5.0.0'; },
    p => { p.scripts.test = 'outro'; }, p => { p.scripts['test:nsdocs-v2'] = 'curl externo'; }]) {
    const modified = structuredClone(after); mutate(modified);
    assert.throws(() => operator.validatePackage(before, modified));
  }
});
test('flags recusam qualquer ativacao ou valor ambiguo; processo e Node DEV fixos', () => {
  operator.validateDisabled({}); operator.validateDisabled({ NSDOCS_V2_ENABLED: 'false' });
  for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    for (const value of ['true', '1', 'yes', 'FALSE', ' false ', false]) {
      assert.throws(() => operator.validateDisabled({ [key]: value }));
    }
  }
  const processes = fixture(), runtime = { executable: NODE, version: 'v24.22.1' };
  assert.equal(operator.validateDev(processes, runtime).name, 'backend-dev');
  for (const mutate of [
    p => { p.pm2_env.watch = true; }, p => { p.pm2_env.exec_interpreter = 'node'; },
    p => { p.pm2_env.pm_cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend'; },
    p => { p.pm2_env.status = 'stopped'; }, p => { p.pm2_env.exec_mode = 'cluster_mode'; }
  ]) {
    const modified = structuredClone(processes); mutate(modified[0]);
    assert.throws(() => operator.validateDev(modified, runtime));
  }
  assert.throws(() => operator.validateDev([...processes, processes[0]], runtime));
  assert.throws(() => operator.validateDev(processes, { ...runtime, version: 'v24.13.0' }));
});
test('comparacao de politica nao depende de ordem de env; peers devem ser identicos', () => {
  const p = fixture()[0], other = structuredClone(p);
  p.pm2_env.env = { a: '1', b: '2' }; other.pm2_env.env = { b: '2', a: '1' };
  assert.deepEqual(operator.devPolicy(p), operator.devPolicy(other));
  assert.throws(() => operator.assertPeers([{ pid: 1 }], [{ pid: 2 }]));
  assert.equal(operator.cleanEnv().NODE_CHANNEL_FD, undefined);
  assert.equal(operator.cleanEnv().PM2_HOME, '/home/ubuntu/.pm2');
});

// Orquestracao real em VM; todas as fronteiras de SO, Git, PM2, DB/probe e HTTP sao ficticias.
function harness({ initialHead = BASE, probeExit = 0, qaExit = 0, peerChanges = false, enabled = false } = {}) {
  const processes = fixture(), calls = [], log = [], files = new Map();
  const { before, after } = packages();
  let head = initialHead, locked = false;
  const io = {
    realpathSync: value => value,
    mkdirSync: () => { assert.equal(locked, false); locked = true; },
    rmdirSync: () => { locked = false; }, existsSync: () => true,
    readlinkSync(file) {
      const pid = Number(file.split('/')[2]);
      return pid === 50 ? PM2_NODE : processes.find(p => p.pid === pid).pm2_env.exec_interpreter;
    },
    readFileSync(file, encoding) {
      let data;
      if (file.endsWith('/pm2.pid')) data = '50';
      else if (file.endsWith('/stat')) data = `50 (PM2 daemon) ${Array(19).fill('0').join(' ')} 813`;
      else if (file.endsWith('/environ')) data = `HOME=/home/ubuntu\0NODE_CHANNEL_FD=3\0NSDOCS_V2_ENABLED=${enabled ? 'true' : 'false'}\0`;
      else data = files.get(file) || `fixture:${file}`;
      return encoding ? data : Buffer.from(data);
    }
  };
  const spawn = (bin, args, options) => {
    calls.push({ bin, args, options });
    let stdout = '', status = 0;
    if (bin === 'git') {
      if (args[0] === 'branch') stdout = 'refactor/frontend';
      else if (args[0] === 'status') stdout = '';
      else if (args[0] === 'diff') stdout = CHANGESET.join('\n');
      else if (args[0] === 'show') stdout = JSON.stringify(args[1].startsWith(BASE) ? before : after);
      else if (args[0] === 'merge') { head = args.at(-1); }
      else if (args[0] === 'rev-parse') {
        stdout = args.includes('--show-toplevel') ? ROOT : args.includes('--git-path') ? '.git/nsdocs.lock' : head;
      }
    } else if (args[0] === '/usr/lib/node_modules/pm2/bin/pm2') {
      assert.equal(bin, PM2_NODE);
      if (args[1] === 'jlist') stdout = JSON.stringify(processes);
      else {
        assert.deepEqual(Array.from(args), ['/usr/lib/node_modules/pm2/bin/pm2', 'restart', '1']);
        processes[0].pid = 104; processes[0].pm2_env.restart_time += 1;
        if (peerChanges) processes[1].pid = 105;
      }
    } else if (args[0] === '--version') stdout = 'v24.22.1';
    else if (args[0] === '-e') {
      assert.equal(bin, NODE);
      assert.equal(options.env.NODE_CHANNEL_FD, undefined);
      assert.match(args[1], /assertMigrationsUpToDate/);
      assert.match(args[1], /SELECT @@GLOBAL.server_uuid/);
      assert.doesNotMatch(args[1], /runMigrations\(\)|\.up\(/);
      status = probeExit;
    } else status = qaExit;
    return { stdout, status };
  };
  const context = {
    module: { exports: {} }, process: { platform: 'linux', getuid: () => 1000, cwd: () => ROOT, argv: ['node', 'harness'] },
    Buffer, structuredClone, JSON, setTimeout: fn => { fn(); },
    console: { log: value => log.push(value) },
    require(name) {
      if (name === 'node:fs') return io;
      if (name === 'node:child_process') return { spawnSync: spawn };
      if (name === 'node:http') return { get(options, callback) {
        assert.equal(options.host, '127.0.0.1'); assert([8000, 8001].includes(options.port));
        const req = new EventEmitter(); req.destroy = () => {};
        queueMicrotask(() => {
          const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
          callback(res); res.emit('data', '{"ok":true}'); res.emit('end');
        });
        return req;
      } };
      assert(['node:path', 'node:crypto', 'node:util'].includes(name));
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'atualizar-dev-nsdocs-v2-20261024.cjs'), 'utf8'), context);
  return { main: () => context.module.exports.main(VERSION), calls, log,
    get head() { return head; }, get locked() { return locked; } };
}
test('fluxo completo simulado: merge e QA, restart so do DEV, esquema apenas consultado', async () => {
  const h = harness(); await h.main();
  assert.equal(h.head, VERSION); assert.equal(h.locked, false);
  const restarts = h.calls.filter(call => call.args.includes('restart'));
  assert.equal(restarts.length, 1);
  assert.equal(restarts[0].args.at(-1), '1');
  const result = JSON.parse(h.log.find(value => typeof value === 'string' && value.startsWith('{')));
  assert.equal(result.conector_desligado, true);
  assert.equal(result.producao_experience_daemon_e_dumps_preservados, true);
  assert.equal(h.calls.some(call => call.args.some(arg => ['save', 'update', 'resurrect', '--update-env', 'install'].includes(arg))), false);
});
test('HEAD anterior/configuracao/schema reprovado interrompem antes do merge e restart', async () => {
  for (const settings of [{ initialHead: 'b'.repeat(40) }, { probeExit: 73 }, { enabled: true }]) {
    const h = harness(settings); await assert.rejects(h.main());
    assert.equal(h.calls.some(call => call.args[0] === 'merge' || call.args.includes('restart')), false);
    assert.equal(h.locked, false);
  }
});
test('QA reprovado nao reinicia; mudanca em peer e detectada sem outro restart', async () => {
  const qa = harness({ qaExit: 1 }); await assert.rejects(qa.main());
  assert.equal(qa.calls.some(call => call.args.includes('restart')), false);
  const peer = harness({ peerChanges: true }); await assert.rejects(peer.main());
  assert.equal(peer.calls.filter(call => call.args.includes('restart')).length, 1);
  assert.equal(peer.locked, false);
});
