'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const op = require('./atualizar-dev-nsdocs-captura-20261024.cjs');
const bundle = require('../../backend/src/modules/fiscal/services/nsdocs/manual/rds-ca-us-east-2.json');
const VERSION = 'a'.repeat(40);
function packages() {
  const before = { name: 'backend', scripts: { anterior: 'node anterior.js' }, dependencies: { mysql2: '3' } };
  const after = structuredClone(before);
  after.scripts['test:nsdocs-captura-dev'] = 'node --test scripts/validarNsdocsCapturaDev.js scripts/validarNsdocsSetupDev.js';
  after.scripts['test:deploy-nsdocs-captura-dev'] = 'node --test ../ops/deploy/atualizar-dev-nsdocs-captura-20261024.test.cjs';
  after.dependencies.saxes = '5.0.1'; after.dependencies['@aws-sdk/nested-clients'] = '3.996.12';
  return { before, after };
}
function locks() {
  const before = { packages: { '': { dependencies: {} }, 'node_modules/saxes': { version:'5.0.1' },
    'node_modules/@aws-sdk/nested-clients': { version:'3.996.12' } } };
  const after = structuredClone(before);
  after.packages[''].dependencies = { saxes:'5.0.1', '@aws-sdk/nested-clients':'3.996.12' };
  return {before,after};
}
test('inventario exato; somente declaracoes de duas dependencias ja existentes no lock', () => {
  op.validateInventory(op.CHANGESET);
  assert.throws(() => op.validateInventory(op.CHANGESET.slice(1)));
  for (const extra of ['M\tfrontend/src/app.jsx', 'A\tbackend/migrations/x.js', 'M\tbackend/.env', 'M\tbackend/src/services/authorizationService.js']) {
    assert.throws(() => op.validateInventory([...op.CHANGESET, extra]));
  }
  const { before, after } = packages(); op.validatePackage(before, after);
  after.dependencies.mysql2 = '4'; assert.throws(() => op.validatePackage(before, after));
  const lock = locks(); op.validateLock(lock.before, lock.after);
  lock.after.packages['node_modules/saxes'].version = '6'; assert.throws(() => op.validateLock(lock.before, lock.after));
});
test('flags desligadas e snapshots inteiros preservados, sem PM2 env importado do terminal', () => {
  op.validateFlags({}); op.validateFlags({ NSDOCS_V2_ENABLED: 'false' });
  for (const flag of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    for (const value of ['true', '1', 'yes', 'FALSE', false]) assert.throws(() => op.validateFlags({ [flag]: value }));
  }
  op.assertPreserved([{ pid: 1 }], [{ pid: 1 }]);
  assert.throws(() => op.assertPreserved([{ pid: 1 }], [{ pid: 2 }]));
  assert.equal(op.cleanEnv().NODE_CHANNEL_FD, undefined);
});
test('CA publica AWS pinada e valida; rejeita substituicao e expiracao', () => {
  op.validateCaBundle(bundle);
  assert.throws(() => op.validateCaBundle({ ...bundle, pem: bundle.pem + 'alterado' }));
  assert.throws(() => op.validateCaBundle(bundle, Date.parse('2500-01-01T00:00:00Z')));
});

function harness({ head = op.BASE, preflightExit = 0, qaExit = 0, listExit = 0, mutatePeer = false, enabled = false } = {}) {
  const { before, after } = packages();
  const calls = [], logs = [], reads = [];
  let locked = false;
  const apps = [
    ['backend-dev', 1, 101, `${op.ROOT}/backend`, op.NODE, 'server.js'],
    ['backend-solicitacoes', 0, 102, '/home/ubuntu/sistema-gestao-solicitacoes-main/backend', '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node', 'server.js'],
    ['fluxy-experience-api', 3, 103, '/home/ubuntu/fluxy-experience/api', '/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node', 'src/server.js']
  ].map(([name, pm_id, pid, cwd, node, script]) => ({ name, pm_id, pid, pm2_env: {
    pm_cwd: cwd, pm_exec_path: `${cwd}/${script}`, exec_interpreter: node, exec_mode: 'fork_mode',
    status: 'online', watch: false, env: { FIXTURE: 'SEM_SEGREDOS' },
    NSDOCS_V2_ENABLED: name === 'backend-dev' && enabled ? 'true' : 'false', pm_uptime: 1, restart_time: 0
  } }));
  const io = {
    realpathSync: value => value,
    mkdirSync() { assert.equal(locked, false); locked = true; }, rmdirSync() { locked = false; },
    readlinkSync(file) { const pid = Number(file.split('/')[2]); return pid === 50 ? op.PM2_NODE : apps.find(p => p.pid === pid).pm2_env.exec_interpreter; },
    readFileSync(file, encoding) {
      reads.push(file); assert(!file.includes('credentials.json') && !file.includes('fluxy-nsdocs-dev'));
      const data = file.endsWith('/pm2.pid') ? '50' : file.endsWith('/stat') ? `50 (PM2 daemon) ${Array(20).fill('0').join(' ')}` :
        file.endsWith('/environ') ? 'NODE_CHANNEL_FD=3\0PORT=8001\0DEPLOYMENT_ENV=development\0' : `conteudo-ficticio:${file}`;
      return encoding ? data : Buffer.from(data);
    }
  };
  const spawnSync = (bin, args, options) => {
    calls.push({ bin, args, options }); let stdout = '', status = 0;
    if (bin === '/usr/bin/git') {
      switch (args[0]) {
        case 'branch': stdout = 'refactor/frontend'; break;
        case 'rev-parse': stdout = args.includes('--show-toplevel') ? op.ROOT : args.includes('--git-path') ? '.git/manual.lock' : head; break;
        case 'diff': stdout = op.CHANGESET.join('\n'); break;
        case 'show': {
          const values = args[1].endsWith('package-lock.json') ? locks() : {before,after};
          stdout = JSON.stringify(args[1].endsWith(op.CA_PATH) ? bundle : args[1].startsWith(op.BASE) ? values.before : values.after); break;
        }
        case 'merge': head = args.at(-1); if (mutatePeer) apps[1].pid = 202; break;
      }
    } else if (bin === op.PM2_NODE) {
      assert.equal(args.length, 2); assert.equal(args[0], op.PM2_CLI); assert.equal(args[1], 'jlist');
      stdout = JSON.stringify(apps);
    } else if (args[0] === '--version') stdout = 'v24.22.1';
    else if (args[0] === '-e') {
      assert.equal(options.env.NODE_CHANNEL_FD, undefined);
      if (options.input) {
        assert.match(args[1], /START TRANSACTION READ ONLY/); assert.match(args[1], /rollback/);
        assert.equal(JSON.parse(options.input).sha256, bundle.sha256);
      } else { assert(args[1].includes('AssumeRoleCommand')); }
      assert.doesNotMatch(args[1], /Authorization|credentials\.json/);
      status = preflightExit;
    } else if (args.includes('--conferir')) {
      assert.equal(args.length, 2);
      status = listExit;
      stdout = JSON.stringify({ outcome: 'NSDOCS_SETUP_DEV_CONFERIDO', chamadas_nsdocs: 0,
        company_id:2, pending:['202610240001_fiscal_nsdocs_capturas.js'], applied:false });
    } else status = qaExit;
    return { stdout, status };
  };
  const context = { module: { exports: {} }, Buffer, JSON, structuredClone,
    process: { platform: 'linux', getuid: () => 1000, cwd: () => op.ROOT, argv: ['node', 'test'] },
    console: { log: value => logs.push(value) }, require(name) {
      if (name === 'node:fs') return io;
      if (name === 'node:child_process') return { spawnSync };
      if (name === 'node:http') return { get(options, callback) {
        assert.equal(options.host, '127.0.0.1'); assert([8000, 8001].includes(options.port));
        const req = new EventEmitter(); req.destroy = () => {};
        queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
          callback(res); res.emit('data', '{"ok":true}'); res.emit('end'); });
        return req;
      } };
      assert(['node:path', 'node:crypto', 'node:util'].includes(name)); return require(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'atualizar-dev-nsdocs-captura-20261024.cjs'), 'utf8'), context);
  return { main: () => context.module.exports.main(VERSION), calls, logs, reads,
    get locked() { return locked; }, get head() { return head; } };
}
test('orquestracao real simulada: atualiza arquivos, QA e leitura local, sem restart/setup/API', async () => {
  const h = harness(); await h.main();
  assert.equal(h.head, VERSION); assert.equal(h.locked, false);
  assert(h.calls.every(call => !call.args.some(arg => ['restart', '--update-env', '--consultar', '--configurar', 'save', 'update', 'install'].includes(arg))));
  const proof = JSON.parse(h.logs.find(line => typeof line === 'string' && line.startsWith('{')));
  assert.equal(proof.etapa, 'NSDOCS_CAPTURA_DEV_ARQUIVOS_PRONTOS');
  assert.equal(proof.chamadas_nsdocs, 0); assert.equal(proof.conector_automatico_desligado, true);
});
test('replay no alvo tambem confere processo sem reinicio', async () => {
  for (const head of [VERSION]) {
    const h = harness({ head }); await h.main(); assert.equal(h.head, VERSION);
  }
});
test('falha na conferencia indica etapa sem imprimir ambiente ou stderr bruto', async () => {
  const h = harness({ listExit: 1 });
  await assert.rejects(h.main(), error => error.message === 'CONFERENCIA_CAPTURA_DEV_FALHOU_SEM_EXIBIR_DADOS');
  assert(h.logs.includes('TLS_UUID_DEV_CONFERIDOS_EM_LEITURA'));
  assert(!h.logs.some(value => String(value).includes('NSDOCS_CAPTURA_DEV_ARQUIVOS_PRONTOS')));
  assert.equal(h.locked, false);
});
test('preflight real em VM aceita CA global ausente e exige TLS, UUID e rollback', async () => {
  const h = harness(); await h.main();
  const call = h.calls.find(call => call.args[0] === '-e'), queries = [];
  let closed = false;
  const context = { process: { env: {}, exit: code => { throw Error('EXIT_' + code); }, exitCode: 0 },
    require(name) {
      if (name === 'node:fs') return { readFileSync: file => file === 0 ? call.options.input : 'SEM_SEGREDOS' };
      if (name === 'dotenv') return { parse: () => ({}) };
      if (name === './src/config/env') return { env: { deploymentEnvironment: 'development', port: 8001,
        dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', dbName: 'gestao_solicitacoes', dbSslCaFile: '' }, validateRequiredEnv() {} };
      if (name.includes('/nsdocs/config')) return { getDiagnostics: () => ({ enabled: false, configuration_valid: true, mode: 'disabled' }) };
      if (name === 'mysql2/promise') return { createConnection: async options => {
        assert.equal(options.ssl.ca, bundle.pem); assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.ssl.verifyIdentity, true);
        return { query: async sql => { queries.push(sql); return sql.startsWith('SHOW') ? [[{ Value: 'TLS_FICTICIO' }]] :
          sql.startsWith('SELECT') ? [[{ uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' }]] : []; },
          rollback: async () => queries.push('ROLLBACK'), end: async () => { closed = true; } };
      } };
      throw Error('Dependencia nao isolada');
    } };
  await vm.runInNewContext(call.args[1], context);
  assert.equal(context.process.exitCode, 0); assert.equal(closed, true); assert.equal(queries.at(-1), 'ROLLBACK');
  assert(queries.some(sql => sql.includes('Ssl_cipher')));
});
test('etapa anterior, flags ou preflight recusados antes do fast-forward', async () => {
  for (const settings of [{ head: 'b'.repeat(40) }, { preflightExit: 73 }, { enabled: true }]) {
    const h = harness(settings); await assert.rejects(h.main());
    assert.equal(h.calls.some(call => call.args[0] === 'merge'), false); assert.equal(h.locked, false);
  }
});
test('QA falho ou mudanca de peer interrompe sem restart, consulta ou chave', async () => {
  for (const settings of [{ qaExit: 1 }, { mutatePeer: true }]) {
    const h = harness(settings); await assert.rejects(h.main());
    assert.equal(h.locked, false);
    assert(h.calls.every(call => !call.args.some(arg => ['restart', '--configurar', '--consultar'].includes(arg))));
    assert(!h.logs.some(line => String(line).includes('NSDOCS_CAPTURA_DEV_ARQUIVOS_PRONTOS')));
  }
});
