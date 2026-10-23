'use strict';
// Guardas/CLI de inventario e QA inteiramente em memoria. Nenhuma EC2/DB real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
// --inventario e transmitido por stdin ANTES do checkout: nao importar arquivos
// novos locais nesse caminho, pois ainda nao existem na versao instalada.
const MIGRATIONS = ['202610220001_titulo_negociacao_pagamento.js', '202610220002_baixa_composta_estornos_cheques.js'];
const BASE = 'fe66315160468b02651a0e6abddfea76050a9ea5';
const DEV = 'd64137c7c30451576d4456bd8ae271e8604909a2';
function validarRoteiro(s) {
  const merge = s.indexOf('git merge --ff-only'), aplicar = s.indexOf('aplicarMigrationsPendenciasProducao20261023.js --aplicar'), restart = s.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > 0 && aplicar > merge && restart > aplicar);
  for (const token of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM',
    'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM', `base_prod=${BASE}`,
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main', 'test "$(git branch --show-current)" = main',
    'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'git merge-base --is-ancestor "$versao_prod" origin/main', 'git merge-base --is-ancestor "$base_prod" HEAD',
    'git merge-base --is-ancestor HEAD "$versao_prod"', 'node - --inventario "$base_prod" "$versao_prod"',
    '.conferirProducao(', 'state.pending.some(nome => !permitidas.includes(nome))', "p.status !== 'online'", 'Number(p.PORT) !== 8000', 'p.watch',
    'p.ALLOW_SCHEMA_MIGRATIONS', "require('node:sqlite')"]) assert(s.indexOf(token) >= 0 && s.indexOf(token) < merge, token);
  for (const nome of ['validarCompraDiretaCredorObrigatorio.js', 'validarTituloNegociacaoPagamento.js', 'validarDevolucaoChequesComposta.js',
    'validarRecargaSaldoOrigens.js', 'validarFilaDestinatarios.js', 'validarTituloDadosPagamento.js', 'validarSegurancaAcessoDireto.js',
    'validarFilaBaixaComposta.js', 'validarOfxMatchesExclusivos.js']) assert(s.indexOf(nome) > merge && s.indexOf(nome) < aplicar, nome);
  assert(s.indexOf('aplicarMigrationsPendenciasProducao20261023.js --concluido') > aplicar);
  assert(s.lastIndexOf('aplicarMigrationsPendenciasProducao20261023.js --concluido') > restart);
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_prod"/g) || []).length, 3);
  assert(s.includes('http://127.0.0.1:8000/health'));
  assert(s.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
  assert(!/--update-env|backend-dev|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|\bgit reset\b|\bssh\b|swapon|swapoff/.test(s));
}
function validarPacote(base, alvo, runtime) {
  const comando = runtime === 'backend'
    ? 'node scripts/validarFilaDestinatarios.js && node scripts/validarTituloDadosPagamento.js'
    : 'node scripts/validarFilaDestinatarios.mjs && node scripts/validarFilaInstrumentosUI.mjs --destinatarios && node scripts/validarTituloDetalheWorkspace.mjs --dados-pagamento';
  assert.deepEqual(alvo, { ...base, scripts: { ...base.scripts, 'test:fila-destinatarios': comando } }, 'Somente um novo comando QA; preservar scripts/dependencias MAIN.');
}
function inventario(base, alvo) {
  assert.equal(base, BASE); assert(/^[0-9a-f]{40}$/.test(alvo));
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8' });
  assert.equal(git(['diff', '--name-status', base, alvo, '--', 'backend/migrations']).trim(), MIGRATIONS.map(m => `A\tbackend/migrations/${m}`).join('\n'));
  git(['diff', '--exit-code', base, alvo, '--', 'backend/package-lock.json', 'frontend/package-lock.json', 'backend/scripts/promoverSchemaProducao20261018.js']);
  git(['merge-base', '--is-ancestor', DEV, alvo]);
  git(['diff', '--exit-code', DEV, alvo, '--', 'backend/src', 'frontend/src', 'backend/migrations']);
  assert(!git(['diff', '--name-status', base, alvo]).split('\n').some(l => l.startsWith('D\t')), 'Nao remover arquivos exclusivos MAIN.');
  for (const runtime of ['backend', 'frontend']) validarPacote(JSON.parse(git(['show', `${base}:${runtime}/package.json`])), JSON.parse(git(['show', `${alvo}:${runtime}/package.json`])), runtime);
  console.log('Inventario PROD aprovado: dois JSON aditivos exatos, DEV integrado/runtime identico, dependencias e exclusividades MAIN preservadas.');
}
function fixture() {
  const { COLUNAS, COLUNAS_SQL, BACKEND } = require('./aplicarMigrationsPendenciasProducao20261023');
  const { IDENTIDADE_SQL, TLS_SQL, JSON_SQL } = require('./promoverSchemaProducao20261018');
  const arquivo = { DB_HOST: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com', DB_NAME: 'gestao_solicitacoes',
    DB_SSL_CA_FILE: '/certs/rds.pem', PORT: '8000', DEPLOYMENT_ENV: 'production', JWT_EXPIRES_IN: '12h',
    PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true' };
  const runtimeEnv = { ...arquivo, CONFIRM_PROD_BACKUP: 'SIM', CONFIRM_PROD_BACKUP_TIMER: 'SIM' };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: { ...arquivo, pm_exec_path: `${BACKEND}/server.js`, status: 'online', watch: false } }];
  const state = { tableExists: true, pending: [...MIGRATIONS], colunas: [], aplicacoes: 0, consultas: 0,
    uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', tls: true, timer: true, falha: false };
  const colunas = () => COLUNAS.map(([tabela, coluna]) => ({ tabela, coluna, tipo: 'json', anulavel: 'YES' }));
  const ctx = { modo: '--aplicar', cwd: BACKEND, runtimeEnv,
    env: { deploymentEnvironment: 'production', port: 8000, dbHost: arquivo.DB_HOST, dbName: arquivo.DB_NAME,
      dbSslCaFile: arquivo.DB_SSL_CA_FILE, jwtExpiresIn: '12h', paymentOwnerApprovalMode: 'PILOT',
      devUserSwitchEnabled: false, productionUserSwitchEnabled: true },
    validateRequiredEnv() {}, log() {}, execFileSync(cmd, args) {
      if (cmd === 'pm2') { assert.deepEqual(args, ['jlist']); return JSON.stringify(processos); }
      assert.equal(cmd, 'systemctl'); assert.deepEqual(args, ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
      if (!state.timer) throw Error('Timer inativo'); return '';
    }, fileSystem: { readFileSync(file) { assert.equal(file, `${BACKEND}/.env`); return Object.entries(arquivo).map(([k,v]) => `${k}=${v}`).join('\n'); },
      statSync(file) { assert.equal(file, '/certs/rds.pem'); return { isFile: () => true }; } },
    db: { async query(sql) {
      state.consultas++;
      if (sql === IDENTIDADE_SQL) return [[{ uuid: state.uuid, banco: 'gestao_solicitacoes' }]];
      if (sql === TLS_SQL) return [[{ Variable_name: 'Ssl_cipher', Value: state.tls ? 'cipher' : '' }, { Variable_name: 'Ssl_version', Value: state.tls ? 'TLSv1.3' : '' }]];
      if (sql === JSON_SQL) return [[{ item_ok: 7 }]];
      assert.equal(sql, COLUNAS_SQL); return [state.colunas];
    } }, schema: { async getMigrationState() { return state; }, async runMigrations(options) {
      state.aplicacoes++; assert.deepEqual(options, { authorized: true }); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
      if (state.falha) throw Error('Falha simulada'); state.pending = []; state.colunas = colunas();
    }, async assertMigrationsUpToDate() { assert.deepEqual(state.pending, []); } }
  };
  return { ctx, state, processos, arquivo, colunas };
}
async function qa() {
  const aplicador = require('./aplicarMigrationsPendenciasProducao20261023');
  const { executar } = aplicador;
  assert.deepEqual(MIGRATIONS, aplicador.MIGRATIONS);
  // Simular execucao do inventario por stdin antes de instalar o pacote.
  const vm = require('node:vm');
  let inventarioExecutado = false;
  const gitSimulado = args => {
    inventarioExecutado = true;
    if (args[0] === 'show') {
      const runtime = args[1].includes('frontend/') ? 'frontend' : 'backend';
      const pacote = { scripts: { antigo: 'QA' } };
      if (!args[1].startsWith(BASE + ':')) pacote.scripts['test:fila-destinatarios'] = runtime === 'backend'
        ? 'node scripts/validarFilaDestinatarios.js && node scripts/validarTituloDadosPagamento.js'
        : 'node scripts/validarFilaDestinatarios.mjs && node scripts/validarFilaInstrumentosUI.mjs --destinatarios && node scripts/validarTituloDetalheWorkspace.mjs --dados-pagamento';
      return JSON.stringify(pacote);
    }
    if (args[0] === 'diff' && args.includes('backend/migrations') && args.includes('--name-status')) return MIGRATIONS.map(m => `A\tbackend/migrations/${m}`).join('\n');
    return '';
  };
  new vm.Script(fs.readFileSync(__filename, 'utf8')).runInNewContext({
    require(nome) {
      assert(nome.startsWith('node:'), 'Inventario nao deve depender de arquivo local antes do checkout.');
      return nome === 'node:child_process' ? { execFileSync(_cmd, args) { return gitSimulado(args); } } : require(nome);
    },
    process: { argv: ['node', '-', '--inventario', BASE, DEV] }, module: { exports: {} }, console: { log() {} }
  });
  assert(inventarioExecutado);
  const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-pendencias-20261023.sh'), 'utf8');
  validarRoteiro(source);
  for (const token of ['flock -n 9', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
    'node - --inventario "$base_prod" "$versao_prod"', 'p.ALLOW_SCHEMA_MIGRATIONS', 'validarDevolucaoChequesComposta.js']) assert.throws(() => validarRoteiro(source.replace(token, 'GUARDA_REMOVIDA')));
  assert.throws(() => validarRoteiro(source.replace('pm2 restart backend-solicitacoes', 'pm2 restart backend-dev')));
  const base = { scripts: { antigo: 'QA' }, dependencies: { dep: '1' } };
  for (const runtime of ['backend', 'frontend']) {
    const alvo = { ...base, scripts: { ...base.scripts, 'test:fila-destinatarios': runtime === 'backend'
      ? 'node scripts/validarFilaDestinatarios.js && node scripts/validarTituloDadosPagamento.js'
      : 'node scripts/validarFilaDestinatarios.mjs && node scripts/validarFilaInstrumentosUI.mjs --destinatarios && node scripts/validarTituloDetalheWorkspace.mjs --dados-pagamento' } };
    validarPacote(base, alvo, runtime);
    assert.throws(() => validarPacote(base, { ...alvo, dependencies: { dep: '2' } }, runtime));
    assert.throws(() => validarPacote(base, { ...alvo, scripts: { ...alvo.scripts, antigo: 'outro' } }, runtime));
  }
  const ok = fixture(), antes = JSON.stringify([ok.ctx.runtimeEnv, ok.arquivo, ok.processos]);
  await executar(ok.ctx); await executar(ok.ctx);
  assert.equal(ok.state.aplicacoes, 1); assert.equal(JSON.stringify([ok.ctx.runtimeEnv, ok.arquivo, ok.processos]), antes);
  const leitura = fixture(); leitura.ctx.modo = '--verificar'; await executar(leitura.ctx); assert.equal(leitura.state.aplicacoes, 0);
  for (const configurar of [f => { f.ctx.cwd = '/dev/backend'; }, f => { f.ctx.env.port = 8001; },
    f => { f.state.uuid = 'outro'; }, f => { f.state.tls = false; }, f => { f.state.timer = false; },
    f => { f.processos[0].pm2_env.watch = true; }, f => { f.processos[0].pm2_env.status = 'stopped'; },
    f => { f.ctx.runtimeEnv.CONFIRM_PROD_BACKUP = 'NAO'; }, f => { f.ctx.runtimeEnv.CONFIRM_PROD_BACKUP_TIMER = 'NAO'; },
    f => { f.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; }, f => { f.state.pending.push('202601010001_estranha.js'); },
    f => { f.state.tableExists = false; }, f => { f.state.colunas = [{ ...f.colunas()[0], tipo: 'text' }]; },
    f => { f.ctx.modo = '--concluido'; }, f => { f.state.pending = []; }]) {
    const f = fixture(); configurar(f); await assert.rejects(executar(f.ctx)); assert.equal(f.state.aplicacoes, 0);
  }
  for (const indice of [0, 1]) { const f = fixture(); f.state.pending = [MIGRATIONS[indice]]; f.state.colunas = [f.colunas()[1 - indice]]; await executar(f.ctx); assert.equal(f.state.aplicacoes, 1); }
  const falha = fixture(); falha.state.falha = true; await assert.rejects(executar(falha.ctx)); assert.equal(falha.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, undefined);
  console.log('OK PROD: duas migrations JSON exclusivas, identidade/TLS/12h/flags/backup/timer/PM28000, leitura, retomada parcial, replay/erro/restauracao DDL, pacotes/roteiro/negativas. Sem EC2/banco/rede reais.');
}
if (process.argv[2] === '--inventario') inventario(...process.argv.slice(3));
else if (require.main === module) qa().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { qa, validarRoteiro, validarPacote, inventario };
