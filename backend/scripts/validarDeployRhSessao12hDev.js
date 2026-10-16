'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dotenv = require('dotenv');
const { executar, conteudoSessao12h, ENV_FILE, BACKEND } = require('./configurarSessao12hDev');
for (const original of [
  'JWT_EXPIRES_IN=8h\nOUTRA="segredo-fixture"\n',
  '# comentario\r\nexport JWT_EXPIRES_IN = "8h" # prazo\r\nOUTRA=qa\r\n',
  'OUTRA=qa', '', 'JWT_EXPIRES_IN=8h\nJWT_EXPIRES_IN=6h\nOUTRA=qa\n',
  'OUTRA="JWT_EXPIRES_IN=8h"\nJWT_EXPIRES_IN=12h\n'
]) {
  const novo = conteudoSessao12h(original), antes = dotenv.parse(original), depois = dotenv.parse(novo);
  assert.equal(depois.JWT_EXPIRES_IN, '12h'); delete antes.JWT_EXPIRES_IN; delete depois.JWT_EXPIRES_IN;
  assert.deepEqual(depois, antes); assert.equal(conteudoSessao12h(novo), novo, 'Repeticao nao altera .env');
}
assert.throws(() => conteudoSessao12h('OUTRA="linha\nJWT_EXPIRES_IN=8h\nfim"\n'), /outra variavel/);
assert.throws(() => conteudoSessao12h('JWT_EXPIRES_IN="8h\nextra"\n'), /varias linhas/);
async function testar(alterar = () => {}) {
  const env = { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', jwtExpiresIn: '8h',
    devUserSwitchEnabled: true, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' };
  const runtimeEnv = {}, processos = [{ name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: '8001', JWT_EXPIRES_IN: '8h' } }];
  const banco = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const state = { modo: '--aplicar', cwd: BACKEND, falhaSchema: false, symlink: false, nlink: 1, realpath: ENV_FILE, falhaRename: false };
  const files = new Map([[ENV_FILE, 'OUTRA=segredo-fixture\nJWT_EXPIRES_IN=8h\n']]), writes = [], modes = new Map();
  let consultas = 0, schemas = 0, erro = null;
  alterar({ env, runtimeEnv, processos, banco, state, files });
  const runtimeAntes = { ...runtimeEnv };
  try {
    await executar({ modo: state.modo, cwd: state.cwd, env, runtimeEnv, validateRequiredEnv() {}, log() {},
      execFileSync(cmd, args) { assert.equal(cmd, 'pm2'); assert.deepEqual(args, ['jlist']); return JSON.stringify(processos); },
      db: { query: async sql => { consultas++; assert.equal(sql, 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco'); return [[banco]]; } },
      schema: { assertMigrationsUpToDate: async () => { schemas++; if (state.falhaSchema) throw Error('Schema pendente'); } },
      fileSystem: {
        lstatSync(p) { assert.equal(p, ENV_FILE); return { isFile: () => true, isSymbolicLink: () => state.symlink, nlink: state.nlink, ino: 10, mode: 0o100640 }; },
        realpathSync: () => state.realpath,
        readFileSync(p) { assert(files.has(p)); return files.get(p); },
        writeFileSync(p, text, options) { assert(p.startsWith(ENV_FILE + '.')); assert.equal(options.flag, 'wx'); assert.equal(options.mode, 0o600); assert(!files.has(p)); files.set(p, text); writes.push(p); modes.set(p, options.mode); },
        chmodSync(p, mode) { assert(p.endsWith('.tmp')); assert.equal(mode, 0o640); modes.set(p, mode); },
        renameSync(from, to) { assert.equal(to, ENV_FILE); if (state.falhaRename) throw Error('Rename falhou'); files.set(to, files.get(from)); files.delete(from); }
      }
    });
  } catch (e) { erro = e; assert(!e.message.includes('segredo-fixture')); }
  assert.deepEqual(runtimeEnv, runtimeAntes, 'Nao alterar flags/ambiente do terminal');
  return { files, writes, modes, consultas, schemas, erro };
}
(async () => {
  let r = await testar(); assert.equal(r.erro, null); assert.equal(r.consultas, 1); assert.equal(r.schemas, 1);
  assert.equal(dotenv.parse(r.files.get(ENV_FILE)).JWT_EXPIRES_IN, '12h'); assert.equal(r.writes.length, 2);
  const backup = r.writes.find(p => p.endsWith('.bak')); assert.equal(r.modes.get(backup), 0o600); assert.equal(dotenv.parse(r.files.get(backup)).JWT_EXPIRES_IN, '8h');
  r = await testar(({ files }) => files.set(ENV_FILE, 'JWT_EXPIRES_IN=12h\n')); assert.equal(r.erro, null); assert.equal(r.writes.length, 0);
  for (const alterar of [
    ({ state }) => { state.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend'; },
    ({ env }) => { env.deploymentEnvironment = 'production'; },
    ({ env }) => { env.port = 8000; },
    ({ env }) => { env.dbHost = 'producao.example'; },
    ({ processos }) => { processos.length = 0; },
    ({ processos }) => { processos.push(processos[0]); },
    ({ processos }) => { processos[0].name = 'backend-solicitacoes'; },
    ({ processos }) => { processos[0].pm2_env.pm_exec_path = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'; },
    ({ processos }) => { processos[0].pm2_env.PORT = '8000'; },
    ({ processos }) => { processos[0].pm2_env.DB_PASSWORD = 'segredo-fixture'; },
    ({ processos }) => { processos[0].pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    ({ processos }) => { processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'false'; },
    ({ processos }) => { processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.writes.length, 0); assert.equal(r.consultas, 0); }
  for (const alterar of [
    ({ banco }) => { banco.uuid = '5ed4b970-009f-11f1-809c-0ad0e0c90c53'; },
    ({ banco }) => { banco.banco = 'outro'; },
    ({ state }) => { state.falhaSchema = true; },
    ({ state }) => { state.symlink = true; },
    ({ state }) => { state.nlink = 2; },
    ({ state }) => { state.realpath = '/outro/.env'; }
  ]) { r = await testar(alterar); assert(r.erro); assert.equal(r.writes.length, 0); }
  r = await testar(({ state }) => { state.falhaRename = true; }); assert(r.erro); assert.equal(dotenv.parse(r.files.get(ENV_FILE)).JWT_EXPIRES_IN, '8h'); assert(r.writes.some(p => p.endsWith('.bak')));
  const verificar = ({ state, env, processos, files }) => { state.modo = '--verificar'; env.jwtExpiresIn = '12h'; processos[0].pm2_env.JWT_EXPIRES_IN = '12h'; files.set(ENV_FILE, 'JWT_EXPIRES_IN=12h\n'); };
  r = await testar(verificar); assert.equal(r.erro, null); assert.equal(r.writes.length, 0);
  r = await testar(s => { verificar(s); s.processos[0].pm2_env.JWT_EXPIRES_IN = '8h'; }); assert(r.erro); assert.equal(r.writes.length, 0);
  const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-rh-sessao-12h-20261016.sh'), 'utf8');
  for (const text of ['flock -n 9', 'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"', 'JWT_EXPIRES_IN=12h pm2 restart backend-dev --update-env', 'node scripts/configurarSessao12hDev.js --verificar']) assert(source.includes(text));
  assert(!source.includes('pm2 restart backend-solicitacoes')); assert(!source.includes('ALLOW_SCHEMA_MIGRATIONS')); assert(!source.includes('runMigrations'));
  assert(source.indexOf('--aplicar') < source.indexOf('pm2 restart')); assert(source.indexOf('--verificar') > source.indexOf('pm2 restart'));
  const bloco = /node <<'NODE'\r?\n([^]*?)\r?\nNODE/.exec(source)[1];
  for (const ok of [true, false]) { let calls = 0; const proc = { exitCode: 0 };
    await vm.runInNewContext(bloco, { process: proc, AbortSignal, setTimeout: fn => fn(), console: { log() {}, error() {} }, fetch: async url => { calls++; assert.equal(url, 'http://127.0.0.1:8001/health'); return { ok }; } });
    assert.equal(proc.exitCode, ok ? 0 : 1); assert.equal(calls, ok ? 1 : 20);
  }
  console.log('Deploy RH/sessao DEV: identidade/schema/PM2, .env exclusivo/backup 0600, alteracao so JWT, repeticao, negativas de producao e health aprovados. Sem arquivos reais/EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
