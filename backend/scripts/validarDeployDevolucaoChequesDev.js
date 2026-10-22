'use strict';
// Somente memoria/texto. Nunca conecta banco nem chama PM2.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { executar, MIGRATION, BACKEND, IDENTIDADE_SQL, COLUNA_SQL } = require('./aplicarMigrationDevolucaoChequesDev');
const { HOST, UUID } = require('./verificarPermutasMySqlDev');
function fixture() {
  let pending = [MIGRATION], coluna = [], aplicadas = 0, consultas = 0;
  const runtimeEnv = { CONFIRM_DEV_BACKUP: 'SIM' };
  const args = { modo: '--verificar', cwd: BACKEND,
    env: { deploymentEnvironment: 'development', port: 8001, dbHost: HOST, dbName: 'gestao_solicitacoes',
      devUserSwitchEnabled: false, productionUserSwitchEnabled: false, paymentOwnerApprovalMode: 'OFF' },
    runtimeEnv, validateRequiredEnv() {}, log() {},
    processos: [{ name: 'backend-dev', pm2_env: { pm_exec_path: `${BACKEND}/server.js`, PORT: 8001, status: 'online', watch: false } }],
    db: { async query(sql) {
      consultas++;
      if (sql === IDENTIDADE_SQL) return [[{ uuid: UUID, banco: 'gestao_solicitacoes' }]];
      if (sql === COLUNA_SQL) return [coluna];
      if (sql === "SHOW SESSION STATUS LIKE 'Ssl_cipher'") return [[{ Value: 'TLS_TEST' }]];
      throw Error('SQL nao esperado: ' + sql);
    } },
    schema: { async getMigrationState() { return { tableExists: true, pending }; },
      async assertMigrationsUpToDate() { assert.deepEqual(pending, []); },
      async runMigrations(options) { assert.deepEqual(options, { authorized: true }); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
        aplicadas++; pending = []; coluna = [{ tipo: 'json', anulavel: 'YES' }]; } } };
  return { args, counts: () => ({ aplicadas, consultas }), setColuna(value) { coluna = value; }, setPending(value) { pending = value; } };
}
function validarRoteiro(s) {
  const merge = s.indexOf('git merge --ff-only'), aplicar = s.indexOf('aplicarMigrationDevolucaoChequesDev.js --aplicar');
  const restart = s.indexOf('pm2 restart backend-dev');
  assert(merge > 0 && aplicar > merge && restart > aplicar);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]', 'test "${CONFIRM_DEV_BACKUP:-}" = SIM',
    'base_dev=28670b81fe1f2983788b6680cc3c3631415bc5b6', 'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'git cat-file -e HEAD:backend/scripts/aplicarMigrationDevolucaoChequesDev.js',
    'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001', 'p.ALLOW_SCHEMA_MIGRATIONS',
    'process.env.ALLOW_SCHEMA_MIGRATIONS', 'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_dev" HEAD', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json',
    "':(exclude)backend/migrations/202610220002_baixa_composta_estornos_cheques.js'"]) {
    assert(s.indexOf(token) >= 0 && s.indexOf(token) < merge, token);
  }
  for (const token of ['validarDeployDevolucaoChequesDev.js', 'validarDevolucaoChequesComposta.js',
    'validarTituloNegociacaoPagamento.js', 'validarTituloRenegociacaoService.js', 'validarTitulosCompartilhadosSincronizacao.js']) {
    assert(s.indexOf(token) > merge && s.indexOf(token) < aplicar, token);
  }
  assert(s.lastIndexOf('aplicarMigrationDevolucaoChequesDev.js --verificar') > restart);
  assert(s.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert(s.includes('env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev'));
  assert(s.includes('http://127.0.0.1:8001/health'));
  assert(!/--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|\bgit reset\b|ALLOW_SCHEMA_MIGRATIONS=true|swapon|swapoff/.test(s));
}
async function qa() {
  assert.equal(MIGRATION, '202610220002_baixa_composta_estornos_cheques.js');
  assert(COLUNA_SQL.includes("table_name = 'baixas_financeiras_grupos'"));
  assert(COLUNA_SQL.includes("column_name = 'estornos_cheques'"));
  let f = fixture(); await executar(f.args); assert.equal(f.counts().aplicadas, 0);
  f.args.modo = '--aplicar'; await executar(f.args); await executar(f.args);
  assert.equal(f.counts().aplicadas, 1); assert.equal(f.args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, undefined);
  f = fixture(); f.args.modo = '--aplicar'; f.args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'false';
  await executar(f.args); assert.equal(f.args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'false');
  for (const mudar of [
    a => { a.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend'; },
    a => { a.env.deploymentEnvironment = 'production'; }, a => { a.env.port = 8000; },
    a => { a.env.dbHost = 'producao'; }, a => { a.env.dbName = 'outro'; },
    a => { a.processos[0].name = 'backend-solicitacoes'; }, a => { a.processos.push(a.processos[0]); },
    a => { a.processos[0].pm2_env.pm_exec_path = '/producao/server.js'; },
    a => { a.processos[0].pm2_env.PORT = 8000; }, a => { a.processos[0].pm2_env.watch = true; },
    a => { a.processos[0].pm2_env.status = 'stopped'; },
    a => { a.processos[0].pm2_env.DB_PASSWORD = 'DIVERGE_TEST'; },
    a => { a.processos[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    a => { a.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    a => { a.processos[0].pm2_env.PAYMENT_OWNER_APPROVAL_MODE = 'ENFORCED'; },
    a => { a.processos[0].pm2_env.DEV_USER_SWITCH_ENABLED = 'true'; }
  ]) {
    f = fixture(); f.args.modo = '--aplicar'; mudar(f.args); await assert.rejects(executar(f.args));
    assert.equal(f.counts().aplicadas, 0); assert.equal(f.counts().consultas, 0);
  }
  for (const caso of ['uuid', 'pendencia', 'migration_anterior', 'tabela', 'coluna', 'backup', 'tls', 'falha_runner', 'coluna_ausente']) {
    f = fixture(); f.args.modo = '--aplicar';
    if (caso === 'uuid') { const q = f.args.db.query; f.args.db.query = sql => sql === IDENTIDADE_SQL ? [[{ uuid: 'PROD', banco: 'gestao_solicitacoes' }]] : q(sql); }
    if (caso === 'pendencia') f.setPending([MIGRATION, 'outra.js']);
    if (caso === 'migration_anterior') f.setPending(['202610220001_titulo_negociacao_pagamento.js', MIGRATION]);
    if (caso === 'tabela') f.args.schema.getMigrationState = async () => ({ tableExists: false, pending: [MIGRATION] });
    if (caso === 'coluna') f.setColuna([{ tipo: 'text', anulavel: 'YES' }]);
    if (caso === 'backup') delete f.args.runtimeEnv.CONFIRM_DEV_BACKUP;
    if (caso === 'tls') { f.args.env.dbSslCaFile = '/teste/ca.pem'; const q = f.args.db.query;
      f.args.db.query = sql => sql.includes('Ssl_cipher') ? [[{ Value: '' }]] : q(sql); }
    if (caso === 'falha_runner') f.args.schema.runMigrations = async () => { throw Error('DDL_TEST_FAIL'); };
    if (caso === 'coluna_ausente') { f.setPending([]); }
    await assert.rejects(executar(f.args), undefined, caso);
    assert.equal(f.counts().aplicadas, 0, caso); assert.equal(f.args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, undefined);
  }
  const s = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-devolucao-cheques-20261022.sh'), 'utf8');
  validarRoteiro(s);
  for (const token of ['flock -n 9', 'test "${CONFIRM_DEV_BACKUP:-}" = SIM', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'aplicarMigrationDevolucaoChequesDev.js --aplicar', 'validarTituloNegociacaoPagamento.js', 'p.ALLOW_SCHEMA_MIGRATIONS']) {
    assert.throws(() => validarRoteiro(s.replace(token, 'GUARDA_REMOVIDA')), { name: 'AssertionError' });
  }
  assert.throws(() => validarRoteiro(s.replace('pm2 restart backend-dev', 'pm2 restart backend-solicitacoes')));
  console.log('Deploy DEV devolucao seletiva de cheques aprovado: ambiente/PM2/UUID/schema/backup/TLS quando configurado, migration unica, idempotencia/restauracao de flag, ff-only/testes antes de restart exclusivo8001. Sem banco real.');
}
if (require.main === module) qa().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { validarRoteiro, qa };
