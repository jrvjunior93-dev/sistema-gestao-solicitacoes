'use strict';
// --inventario funciona por stdin no checkout anterior. QA: fixtures/VM apenas.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), vm = require('node:vm');
const BASE = '4922ebad648bb8532f4ea55fcbe6052bb004f2f4', DEV = 'f598f25a46ef92ad85500dced976c384282d5b88';
const MIGRATIONS = ['202610230001_medicao_rejeicao_favorecido_titulo.js', '202610230002_medicao_vinculos_ativos.js'];
const NOVOS = {
  backend: {
    'test:medicao-reenvio': 'node scripts/validarMedicaoVinculoSchema.js && node scripts/validarMedicaoRejeicaoFavorecido.js',
    'test:medicao-rejeicao-favorecido': 'node scripts/validarMedicaoRejeicaoFavorecido.js',
    'test:fila-filtros-pesquisa': 'node scripts/validarFilaFiltrosPesquisa.js && node scripts/validarFilaFiltrosDp.js && node scripts/validarFilaPaginacao.js',
    'test:solicitacao-distribuicao-gerencial': 'node scripts/validarSolicitacaoDistribuicaoGerencial.js'
  }, frontend: {
    'test:medicao-rejeicao-favorecido': 'node scripts/validarMedicaoRejeicaoFavorecidoUI.mjs',
    'test:fila-filtros-arranjo': 'node scripts/validarFiltrosOrdenaveis.mjs && node scripts/validarFilaInstrumentosUI.mjs --filtros-arranjo',
    'test:fila-filtros-pesquisa': 'node scripts/validarFilaInstrumentosUI.mjs --filtros-pesquisa',
    'test:solicitacao-distribuicao-gerencial': 'node scripts/validarDistribuicaoGerencialSalva.mjs && node scripts/validarSolicitacaoDistribuicaoGerencialUI.mjs'
  }
};
function pacote(antes, depois, runtime) {
  assert.deepEqual(depois, { ...antes, scripts: { ...antes.scripts, ...NOVOS[runtime] } }, 'Somente quatro novos scripts QA; preservar manifesto/dependencias MAIN.');
}
function inventario(base, alvo, git = args => cp.execFileSync('git', args, { encoding: 'utf8' })) {
  assert.equal(base, BASE); assert(/^[0-9a-f]{40}$/.test(alvo));
  assert.equal(git(['diff', '--name-status', base, alvo, '--', 'backend/migrations']).trim(), MIGRATIONS.map(m => 'A\tbackend/migrations/' + m).join('\n'));
  git(['diff', '--exit-code', base, alvo, '--', 'backend/package-lock.json', 'frontend/package-lock.json', 'backend/scripts/promoverSchemaProducao20261018.js']);
  git(['merge-base', '--is-ancestor', DEV, alvo]);
  git(['diff', '--exit-code', DEV, alvo, '--', 'backend/src', 'frontend/src', 'backend/migrations']);
  assert.equal(git(['diff', '--name-only', '--diff-filter=D', base, alvo]).trim(), '', 'Nao remover exclusividades MAIN.');
  for (const runtime of ['backend', 'frontend']) pacote(JSON.parse(git(['show', `${base}:${runtime}/package.json`])), JSON.parse(git(['show', `${alvo}:${runtime}/package.json`])), runtime);
  console.log('Inventario PROD: seis commits DEV integrados, runtime/migrations identicos, duas migrations novas, dependencias e exclusividades MAIN preservadas.');
}
function validarRoteiro(s) {
  const merge = s.indexOf('git merge --ff-only'), aplicar = s.indexOf('aplicarMigrationsMedicaoFiltrosProducao20261023.js --aplicar'), restart = s.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > 0 && aplicar > merge && restart > aplicar);
  for (const token of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM',
    'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM', 'test "${CONFIRM_PROD_MAINTENANCE:-}" = SIM', `base_prod=${BASE}`,
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main', 'test "$(git branch --show-current)" = main',
    'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'git merge-base --is-ancestor "$versao_prod" origin/main', 'git merge-base --is-ancestor "$base_prod" HEAD',
    'git merge-base --is-ancestor HEAD "$versao_prod"', 'node - --inventario "$base_prod" "$versao_prod"', '.conferirProducao(',
    '.conferirPushPersistido(',
    'state.pending.some(nome => !permitidas.includes(nome))', "p.status !== 'online'", 'Number(p.PORT) !== 8000', 'p.watch',
    'p.ALLOW_SCHEMA_MIGRATIONS', "require('node:sqlite')"]) assert(s.indexOf(token) >= 0 && s.indexOf(token) < merge, token);
  for (const nome of ['validarMedicaoVerificadorMetadata.js', 'validarMedicaoVinculoSchema.js', 'validarMedicaoRejeicaoFavorecido.js',
    'validarContratoSaldoReprogramacao.js', 'validarFilaFiltrosPesquisa.js', 'validarSolicitacaoDistribuicaoGerencial.js', 'validarSegurancaAcessoDireto.js']) assert(s.indexOf(nome) > merge && s.indexOf(nome) < aplicar, nome);
  assert(s.indexOf('aplicarMigrationsMedicaoFiltrosProducao20261023.js --verificar') < aplicar);
  assert(s.indexOf('aplicarMigrationsMedicaoFiltrosProducao20261023.js --concluido') > aplicar);
  assert(s.lastIndexOf('aplicarMigrationsMedicaoFiltrosProducao20261023.js --concluido') > restart);
  assert(s.indexOf('verificarFinanceiroProducao20261019.js --verificar') > aplicar);
  assert(s.indexOf('verificarReenvioAutorizacaoProducao.js --verificar') > aplicar);
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_prod"/g) || []).length, 3);
  assert(s.includes('http://127.0.0.1:8000/health'));
  assert(s.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u CONFIRM_PROD_MAINTENANCE -u ALLOW_SCHEMA_MIGRATIONS'));
  assert(!/--update-env|backend-dev|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|\bgit reset\b|\bssh\b/.test(s));
}
function fixture() {
  const { BACKEND, COLUNAS_SQL } = require('./aplicarMigrationsMedicaoFiltrosProducao20261023');
  const { IDENTIDADE_SQL, TLS_SQL, JSON_SQL } = require('./promoverSchemaProducao20261018');
  const arquivo = { DB_HOST: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com', DB_NAME: 'gestao_solicitacoes',
    DB_SSL_CA_FILE: '/certs/rds.pem', PORT: '8000', DEPLOYMENT_ENV: 'production', JWT_EXPIRES_IN: '12h',
    PAYMENT_OWNER_APPROVAL_MODE: 'PILOT', DEV_USER_SWITCH_ENABLED: 'false', PRODUCTION_USER_SWITCH_ENABLED: 'true' };
  const runtimeEnv = { ...arquivo, CONFIRM_PROD_BACKUP: 'SIM', CONFIRM_PROD_BACKUP_TIMER: 'SIM', CONFIRM_PROD_MAINTENANCE: 'SIM', ALLOW_SCHEMA_MIGRATIONS: 'false' };
  const processos = [{ name: 'backend-solicitacoes', pm2_env: { ...arquivo, pm_exec_path: `${BACKEND}/server.js`, status: 'online', watch: false } }];
  const indice = (name, campos) => ({ name, unique: true, fields: campos.map(attribute => ({ attribute })) });
  const s = { tableExists: true, pending: [...MIGRATIONS], json: [], apply: 0, logs: [], sql: [], fail: false,
    uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', tls: true, timer: true, versao: '8.0.40', engine: 'InnoDB', duplicadas: [], eventos: [],
    cols: ['solicitacao_id', 'medicao_id', 'contrato_parcela_id', 'devolvido_em'].map(nome => ({ nome })),
    indices: [indice('medicao_parcelas_unico', ['solicitacao_id', 'contrato_parcela_id'])] };
  const aplicarJson = () => { s.json = [{ tabela: 'contrato_medicoes', coluna: 'rejeicao', tipo: 'json', anulavel: 'YES' },
    { tabela: 'titulos_financeiros', coluna: 'pagamento_favorecido', tipo: 'json', anulavel: 'YES' }]; };
  const aplicarIndices = () => {
    s.cols.push({ nome: 'vinculo_ativo', tipo: 'tinyint', anulavel: 'YES', extra: 'VIRTUAL GENERATED',
      expressao: '(case when (`devolvido_em` is null) then 1 else NULL end)' },
    { nome: 'evento_chave', tipo: 'varchar', anulavel: 'YES', extra: 'VIRTUAL GENERATED', tamanho: 64,
      expressao: "(case when (`medicao_id` is null) then concat(_utf8mb4\\'S\\',`solicitacao_id`) else concat(_utf8mb4\\'M\\',`medicao_id`) end)" });
    s.indices = [indice('medicao_parcelas_ativa_unica', ['contrato_parcela_id', 'vinculo_ativo']),
      indice('medicao_parcelas_evento_unico', ['contrato_parcela_id', 'evento_chave']),
      { ...indice('medicao_parcelas_solicitacao', ['solicitacao_id']), unique: false }];
  };
  const ctx = { modo: '--aplicar', cwd: BACKEND, runtimeEnv, validateRequiredEnv() {}, log: m => s.logs.push(m),
    env: { deploymentEnvironment: 'production', port: 8000, dbHost: arquivo.DB_HOST, dbName: arquivo.DB_NAME,
      dbSslCaFile: arquivo.DB_SSL_CA_FILE, jwtExpiresIn: '12h', paymentOwnerApprovalMode: 'PILOT', devUserSwitchEnabled: false, productionUserSwitchEnabled: true },
    execFileSync(cmd, args) {
      if (cmd === 'pm2') { assert.deepEqual(args, ['jlist']); return JSON.stringify(processos); }
      assert.equal(cmd, 'systemctl'); assert.deepEqual(args, ['is-active', '--quiet', 'fluxy-prod-db-backup.timer']);
      if (!s.timer) throw Error('TIMER_INATIVO'); return '';
    }, fileSystem: { readFileSync(file) { assert.equal(file, `${BACKEND}/.env`); return Object.entries(arquivo).map(([k,v]) => `${k}=${v}`).join('\n'); },
      statSync(file) { assert.equal(file, '/certs/rds.pem'); return { isFile: () => true }; } },
    db: { getQueryInterface: () => ({ showIndex: async () => s.indices }), async query(sql) {
      s.sql.push(sql); assert(/^(?:SELECT|SHOW)\b/.test(sql.trim()), 'Nenhuma escrita financeira/DDL real pode chegar a fixture');
      if (sql === IDENTIDADE_SQL) return [[{ uuid: s.uuid, banco: 'gestao_solicitacoes' }]];
      if (sql === TLS_SQL) return [[{ Variable_name: 'Ssl_cipher', Value: s.tls ? 'cipher' : '' }, { Variable_name: 'Ssl_version', Value: s.tls ? 'TLSv1.3' : '' }]];
      if (sql === JSON_SQL) return [[{ item_ok: 7 }]];
      if (sql === COLUNAS_SQL) return [s.json];
      if (sql === 'SELECT VERSION() AS versao') return [[{ versao: s.versao }]];
      if (sql.includes('information_schema.TABLES')) return [[{ engine: s.engine }]];
      if (sql.includes('information_schema.COLUMNS')) return [s.cols];
      if (sql.includes('WHERE devolvido_em IS NULL GROUP')) return [s.duplicadas];
      if (sql.includes('GROUP BY contrato_parcela_id, CASE')) return [s.eventos];
      throw Error('SQL_NAO_PREVISTO');
    } }, schema: { getMigrationState: async () => s, async runMigrations(o) {
      s.apply++; assert.deepEqual(o, { authorized: true }); assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'true');
      if (s.fail) throw Error('FALHA_DDL'); aplicarJson(); aplicarIndices(); s.pending = [];
    }, assertMigrationsUpToDate: async () => assert.deepEqual(s.pending, []) } };
  return { ctx, s, arquivo, processos, aplicarJson, aplicarIndices };
}
async function qa() {
  const { executar } = require('./aplicarMigrationsMedicaoFiltrosProducao20261023');
  const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-medicao-filtros-20261023.sh'), 'utf8');
  validarRoteiro(source);
  const blocos = [...source.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]); assert.equal(blocos.length, 2);
  // Executar o bloco PM2 real antes do FF.
  for (const mudar of [null, p => { p.PORT = 8001; }, p => { p.watch = true; }, p => { p.status = 'stopped'; },
    p => { p.ALLOW_SCHEMA_MIGRATIONS = 'true'; }, p => { p.pm_exec_path = '/dev/server.js'; }]) {
    const p = { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: 8000, status: 'online', watch: false }; mudar?.(p);
    const rodar = () => vm.runInNewContext(blocos[0], { require(nome) {
      if (nome === 'node:sqlite') return {};
      assert.equal(nome, 'node:child_process'); return { execFileSync: () => JSON.stringify([{ name: 'backend-solicitacoes', pm2_env: p }]) };
    } }); if (mudar) assert.throws(rodar); else rodar();
  }
  const gitSimulado = args => {
    if (args[0] === 'show') { const runtime = args[1].includes('backend/') ? 'backend' : 'frontend';
      return JSON.stringify({ scripts: { anterior: 'QA', ...(args[1].startsWith(BASE + ':') ? {} : NOVOS[runtime]) }, dependencies: { lib: '1' } }); }
    if (args.includes('--name-status')) return MIGRATIONS.map(m => 'A\tbackend/migrations/' + m).join('\n'); return '';
  };
  inventario(BASE, DEV, gitSimulado);
  for (const runtime of ['backend', 'frontend']) {
    assert.throws(() => pacote({ scripts: {} }, { scripts: NOVOS[runtime], dependencies: { nova: '1' } }, runtime));
  }
  for (const alterar of [x => { x.ctx.cwd = '/dev/backend'; }, x => { x.ctx.env.deploymentEnvironment = 'development'; },
    x => { x.ctx.env.port = 8001; }, x => { x.ctx.env.dbHost = 'outro'; }, x => { x.s.uuid = 'outro'; },
    x => { x.s.tls = false; }, x => { x.s.timer = false; }, x => { x.processos.length = 0; },
    x => { x.processos.push(x.processos[0]); }, x => { x.processos[0].pm2_env.watch = ['src']; },
    x => { x.processos[0].pm2_env.status = 'stopped'; }, x => { x.processos[0].pm2_env.DB_PASSWORD = 'NAO_EXIBIR'; },
    x => { x.ctx.env.jwtExpiresIn = '1h'; }, x => { x.arquivo.PAYMENT_OWNER_APPROVAL_MODE = 'OFF'; },
    x => { x.ctx.env.dbSslCaFile = ''; }, x => { x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    x => { x.ctx.runtimeEnv.CONFIRM_PROD_BACKUP = 'NAO'; }, x => { x.ctx.runtimeEnv.CONFIRM_PROD_BACKUP_TIMER = 'NAO'; },
    x => { x.ctx.runtimeEnv.CONFIRM_PROD_MAINTENANCE = 'NAO'; }, x => { x.s.pending.push('202610220001_outra.js'); },
    x => { x.s.tableExists = false; }, x => { x.s.versao = '5.7.44'; }, x => { x.s.engine = 'MyISAM'; },
    x => { x.s.duplicadas = [{}]; }, x => { x.s.eventos = [{}]; }, x => { x.s.pending = []; },
    x => { x.s.pending = [MIGRATIONS[0]]; }, x => { x.aplicarJson(); x.s.json[0].tipo = 'text'; }]) {
    const x = fixture(); alterar(x); await assert.rejects(executar(x.ctx)); assert.equal(x.s.apply, 0);
    assert(!x.s.logs.join('').includes('NAO_EXIBIR'));
  }
  let x = fixture(); x.ctx.modo = '--verificar'; await executar(x.ctx); assert.equal(x.s.apply, 0);
  x = fixture(); x.ctx.modo = '--concluido'; await assert.rejects(executar(x.ctx), /AINDA_PENDENTE/); assert.equal(x.s.apply, 0);
  x = fixture(); await executar(x.ctx); await executar(x.ctx); assert.equal(x.s.apply, 1); assert.equal(x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'false');
  x.ctx.modo = '--concluido'; await executar(x.ctx); assert.equal(x.s.apply, 1);
  x = fixture(); x.aplicarJson(); x.s.pending = [MIGRATIONS[1]]; await executar(x.ctx); assert.equal(x.s.apply, 1);
  x = fixture(); x.aplicarJson(); x.s.json.pop(); await executar(x.ctx); assert.equal(x.s.apply, 1);
  x = fixture(); x.s.fail = true; await assert.rejects(executar(x.ctx), /FALHA_DDL/); assert.equal(x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS, 'false');
  x = fixture(); x.aplicarJson(); x.aplicarIndices(); x.s.pending = [MIGRATIONS[1]];
  await assert.rejects(executar(x.ctx), /SEM_REGISTRO/); assert.equal(x.s.apply, 0);
  x = fixture(); x.aplicarJson(); x.aplicarIndices(); x.s.pending = []; x.s.indices.pop();
  await assert.rejects(executar(x.ctx), /REGISTRADO_DIVERGENTE/); assert.equal(x.s.apply, 0);
  for (const token of ['flock -n 9', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_MAINTENANCE:-}" = SIM',
    'git merge-base --is-ancestor HEAD "$versao_prod"', 'validarMedicaoVerificadorMetadata.js']) assert.throws(() => validarRoteiro(source.replace(token, 'REMOVIDO')));
  console.log('OK PROD medicao/filtros: guardas reais UUID/TLS/12h/flags/PM28000/timer, allowlist001/002, metadata nativo, leitura/aplicacao/retomada/replay/falha, manifesto/roteiro/negativas. Sem EC2/banco/rede.');
}
if (process.argv[2] === '--inventario') inventario(...process.argv.slice(3));
else if (require.main === module) qa().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { qa, validarRoteiro, inventario, pacote };
