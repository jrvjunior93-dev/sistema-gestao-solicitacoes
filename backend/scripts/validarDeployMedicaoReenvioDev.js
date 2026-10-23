'use strict';
// Somente fixtures/VM: nao executar EC2, PM2, Git remoto ou banco real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { executar, conferirPlano, MIGRATION, BACKEND } = require('./aplicarMigrationMedicaoReenvioDev');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-medicao-reenvio-20261023.sh'), 'utf8');
const blocos = [...source.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
function fixture() {
  const runtimeEnv = {}, logs = [], chamadas = { apply: 0, assert: 0, leituras: 0 };
  const pm = { name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: 8001, status: 'online', watch: false } };
  const processos = [pm], state = { tableExists: true, pending: [MIGRATION] }, banco = { aplicado: false };
  const identidade = { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d', banco: 'gestao_solicitacoes' };
  const args = { modo: '--aplicar', cwd: BACKEND, runtimeEnv, log: x => logs.push(x), validateRequiredEnv() {},
    env: { deploymentEnvironment: 'development', port: 8001, dbHost: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
      devUserSwitchEnabled: false, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' },
    db: { query: async sql => {
      if (sql === 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco') return [[identidade]];
      assert.equal(sql, 'SELECT QA_LEITURA'); chamadas.leituras++; return [[]];
    } },
    migration: { up: async ({ sequelize }) => {
      await sequelize.query('SELECT QA_LEITURA');
      if (!banco.aplicado) await sequelize.query('ALTER TABLE medicao_parcelas ADD INDEX qa (id)');
    } },
    schema: { getMigrationState: async () => state, runMigrations: async o => {
      assert.deepEqual(o, { authorized: true }); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
      chamadas.apply++; state.pending = []; banco.aplicado = true;
    }, assertMigrationsUpToDate: async () => { chamadas.assert++; assert.deepEqual(state.pending, []); } },
    execFileSync(cmd, params) { assert.equal(cmd, 'pm2'); assert.deepEqual(params, ['jlist']); return JSON.stringify(processos); } };
  return { args, runtimeEnv, logs, chamadas, processos, pm, state, identidade, banco };
}
function inventario(alterar = () => {}) {
  const dados = { arquivos: 'M\tbackend/src/controllers/SolicitacaoController.js\nA\tbackend/src/services/medicaoRegistroErroService.js',
    migration: 'A\tbackend/migrations/' + MIGRATION, dependencies: { qa: '1' } }; alterar(dados);
  vm.runInNewContext(blocos[2], { process: { argv: ['node', '-', 'base', 'versao'] }, require(nome) {
    if (nome === 'node:assert/strict') return { equal: assert.equal, deepEqual(a, b, m) { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); } };
    assert.equal(nome, 'node:child_process'); return { execFileSync(cmd, params) {
      assert.equal(cmd, 'git');
      if (params[0] === 'show') return JSON.stringify({ dependencies: params[1].startsWith('base:') ? { qa: '1' } : dados.dependencies, scripts: { qa: params[1] } });
      return params.includes('backend/migrations') ? dados.migration : dados.arquivos;
    } };
  } });
}
function validarShell() {
  const merge = source.indexOf('git merge --ff-only'), aplicar = source.indexOf('node scripts/aplicarMigrationMedicaoReenvioDev.js --aplicar'), restart = source.indexOf('pm2 restart backend-dev');
  assert.equal(blocos.length, 3); assert(merge > 0 && aplicar > merge && restart > aplicar);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]', 'base_dev=be3036675973c9e6e748daa6add5e1be27aaba98',
    'test "${CONFIRM_DEV_BACKUP:-}" = SIM', 'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
    'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend', 'git merge-base --is-ancestor "$base_dev" HEAD',
    'git merge-base --is-ancestor HEAD "$versao_dev"', 'backend/package-lock.json frontend/package-lock.json',
    'assert.deepEqual(manifesto(base), manifesto(versao)', 'assert.equal(migrations,', 'assert.deepEqual(arquivos, [',
    'if test "$(git rev-parse HEAD)" = "$versao_dev"; then']) assert(source.indexOf(token) > 0 && source.indexOf(token) < merge, token);
  assert(source.indexOf('validarDeployMedicaoReenvioDev.js') > merge && source.indexOf('validarDeployMedicaoReenvioDev.js') < aplicar);
  assert(source.indexOf('validarMedicaoVinculoSchema.js --sem-sqlite') > merge && source.indexOf('validarMedicaoVinculoSchema.js --sem-sqlite') < aplicar);
  assert(source.includes('timeout 300s node scripts/aplicarMigrationMedicaoReenvioDev.js --aplicar'));
  assert.equal((source.match(/pm2 restart/g) || []).length, 1);
  assert.equal((source.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert(source.includes('env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev'));
  assert(source.includes('http://127.0.0.1:8001/health'));
  assert(!/--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|\bgit reset\b/.test(source));
}
async function qa() {
  validarShell(); inventario(); inventario(d => { d.arquivos = d.arquivos.replaceAll('\n', '\r\n'); });
  for (const alterar of [d => { d.arquivos += '\nM\tfrontend/src/components/financeiro/FiltrosFilaPagamentos.jsx'; },
    d => { d.arquivos = ''; }, d => { d.migration = ''; }, d => { d.migration += '\nA\tbackend/migrations/outra.js'; },
    d => { d.dependencies.qa = '2'; }]) assert.throws(() => inventario(alterar));
  for (const alterar of [x => { x.args.cwd = '/home/ubuntu/producao/backend'; }, x => { x.args.env.deploymentEnvironment = 'production'; },
    x => { x.args.env.port = 8000; }, x => { x.args.env.dbHost = 'outro'; }, x => { x.args.modo = '--outro'; },
    x => { x.processos.length = 0; }, x => { x.processos.push(x.pm); }, x => { x.pm.pm2_env.PORT = 8000; },
    x => { x.pm.pm2_env.pm_exec_path = '/producao/server.js'; }, x => { x.pm.pm2_env.status = 'stopped'; },
    x => { x.pm.pm2_env.watch = ['src']; }, x => { x.pm.pm2_env.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    x => { x.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; }, x => { x.pm.pm2_env.DB_PASSWORD = 'NAO_EXIBIR'; },
    x => { x.pm.pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; }, x => { x.pm.pm2_env.PRODUCTION_USER_SWITCH_ENABLED = 'true'; },
    x => { x.pm.pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCE'; }, x => { x.identidade.uuid = 'outro'; },
    x => { x.identidade.banco = 'outro'; }, x => { x.state.pending.push('202610230001_medicao_rejeicao_favorecido_titulo.js'); },
    x => { x.state.tableExists = false; }]) {
    const x = fixture(); x.runtimeEnv.CONFIRM_DEV_BACKUP = 'SIM'; alterar(x); await assert.rejects(executar(x.args));
    assert.equal(x.chamadas.apply, 0); assert(!x.logs.join('').includes('NAO_EXIBIR'));
  }
  let x = fixture(); x.args.modo = '--verificar'; await executar(x.args);
  assert.equal(x.chamadas.apply, 0); assert.equal(x.chamadas.assert, 0); assert.equal(x.chamadas.leituras, 1);
  x = fixture(); await assert.rejects(executar(x.args), /BACKUP_DEV/); assert.equal(x.chamadas.apply, 0);
  x = fixture(); x.runtimeEnv.CONFIRM_DEV_BACKUP = 'SIM'; await executar(x.args); await executar(x.args);
  assert.equal(x.chamadas.apply, 1); assert.equal(x.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, undefined);
  x = fixture(); x.runtimeEnv.CONFIRM_DEV_BACKUP = 'SIM'; x.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'false';
  x.args.schema.runMigrations = async () => { throw Error('FALHA_DDL'); };
  await assert.rejects(executar(x.args), /FALHA_DDL/); assert.equal(x.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'false');
  x = fixture(); x.state.pending = [];
  await assert.rejects(executar(x.args), /REGISTRADA_SCHEMA_DIVERGENTE/); assert.equal(x.chamadas.apply, 0);
  x = fixture(); x.runtimeEnv.CONFIRM_DEV_BACKUP = 'SIM'; x.args.schema.runMigrations = async () => { x.state.pending = []; };
  await assert.rejects(executar(x.args), /SCHEMA_INCOMPLETO/);
  x = fixture(); x.args.migration.up = async () => { throw Error('MEDICAO_VINCULOS_ATIVOS_DUPLICADOS'); };
  await assert.rejects(executar(x.args), /VINCULOS_ATIVOS_DUPLICADOS/); assert.equal(x.chamadas.apply, 0);
  await assert.rejects(conferirPlano({}, { up: async ({ sequelize }) => sequelize.query('DELETE FROM medicao_parcelas') }), /ESCRITA_BLOQUEADA/);
  console.log('OK deploy/migration DEV reenvio: SHA/ff/lock/inventario2/migration002, ambiente/UUID/PM2/flags/backup, plano read-only, retomada/schema e restart exclusivo. Sem banco/EC2/rede.');
}
if (require.main === module) qa().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { qa };
