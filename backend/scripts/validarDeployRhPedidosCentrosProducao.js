'use strict';
// QA puro: texto/git, sem env/models/banco/PM2 reais.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const baseProd = '80df65347b2a9d4a491f9516c087e0767dd2ecb1';
const novosScripts = ['test:pedido-reabertura', 'test:rhdp-demissao-conclusao', 'test:centro-custo-distribuicao'];
function validarPacotes(base, alvo) {
  const limpar = pkg => { const copia = JSON.parse(JSON.stringify(pkg));
    for (const key of novosScripts) delete copia.scripts?.[key]; return copia; };
  assert.deepEqual(limpar(alvo), limpar(base), 'Dependencias/scripts anteriores nao podem mudar');
}
function validarRoteiro(script) {
  const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > 0 && restart > merge);
  const antes = token => assert(script.indexOf(token) >= 0 && script.indexOf(token) < merge, token);
  for (const token of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]',
    'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
    `base_prod=${baseProd}`, 'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main',
    'test "$(git branch --show-current)" = main', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    "p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'",
    "p.status !== 'online'", 'p.watch', 'Number(p.PORT) !== 8000', 'p.ALLOW_SCHEMA_MIGRATIONS',
    "require('node:sqlite')", 'git merge-base --is-ancestor "$versao_prod" origin/main',
    'git merge-base --is-ancestor "$base_prod" HEAD', 'git merge-base --is-ancestor HEAD "$versao_prod"',
    'git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations backend/package-lock.json frontend/package-lock.json',
    'node - --pacotes "$base_prod" "$versao_prod"',
    'git diff --quiet "$base_prod" "$versao_prod" -- backend/src',
    'git diff --quiet "$base_prod" "$versao_prod" -- frontend/src']) antes(token);
  const backend = ['controllers/DistribuicaoCentroCustoRelatorioController.js', 'controllers/PedidoCompraController.js',
    'controllers/RhSolicitacaoController.js', 'controllers/SolicitacaoCentroCustoDistribuicaoController.js',
    'observability/pedidoCompraOperacao.js', 'routes.js', 'services/centroCustoDistribuicaoService.js',
    'services/pedidoCompraService.js', 'services/rhDemissaoConclusaoDomain.js', 'services/rhService.js',
    'services/rhSolicitacaoConsultaDomain.js', 'services/rhSolicitacaoPaginaService.js',
    'services/rhSolicitacaoService.js', 'validators/rhValidators.js'];
  for (const arquivo of backend) {
    antes(`':(exclude)backend/src/${arquivo}'`);
    assert(script.lastIndexOf(`src/${arquivo}`) > merge && script.lastIndexOf(`src/${arquivo}`) < restart);
  }
  for (const arquivo of ['components/obras/DistribuicaoCentroCustoConfig.jsx',
    'modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx', 'pages/FinanceiroDistribuicaoCentrosCusto.jsx',
    'pages/FinanceiroRelatorios.jsx', 'pages/FinanceiroResultadoCentrosCusto.jsx', 'pages/NovaSolicitacao.jsx',
    'pages/RhDpPessoal.jsx', 'pages/RhDpPessoalSolicitacoes.jsx', 'services/rhDp.js']) antes(`':(exclude)frontend/src/${arquivo}'`);
  for (const nome of ['verificarFinanceiroProducao20261019.js', 'verificarReenvioAutorizacaoProducao.js']) {
    antes(`${nome} --verificar`);
    assert(script.lastIndexOf(`${nome} --verificar`) > restart);
    assert.equal(script.split(`${nome} --verificar`).length - 1, 3);
  }
  for (const nome of ['validarDeployRhPedidosCentrosProducao.js', 'validarRhDemissaoConclusao.js',
    'validarRhAdmissaoDiaria.js', 'validarRhColaboradorContatos.js', 'validarRhConsultaSalario.js',
    'validarRhDocumentosPacote.js', 'validarRhPagamentoEnvioParcial.js', 'validarPerformanceFilaDp.js',
    'validarDistribuicaoCentroCustoDestinos.js', 'validarAdiantamentoCentroCusto.js', 'validarPedidoReabertura.js',
    'validarPrevisaoEntregaCotacao.js', 'validarCompraRemanejamento.js', 'validarComprasPerformanceFases.js',
    'validarPedidoEntregas.js', 'validarPedidoEntregasAcesso.js', 'validarCompraOfertaSaldoMesmoFornecedor.js',
    'validarEncerramentoSemPedidoHistorico.js', 'validarAcessoPedidosEscopo.js', 'validarAutorizacaoSelecao.js',
    'validarCartaoParcelamentoBaixa.js', 'validarPermutasRelatorio.js', 'validarPeriodoRegistroSolicitacoes.js']) {
    const i = script.indexOf(nome, merge);
    assert(i > merge && i < restart, nome);
  }
  assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
  assert.equal((script.match(/pm2 restart/g) || []).length, 1);
  assert.equal((script.match(/test "\$env_hash_prod"/g) || []).length, 3);
  assert(script.includes('http://127.0.0.1:8000/health'));
  assert(script.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
  assert(!/--aplicar|--update-env|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|backend-dev|\bgit reset\b|--max-old-space-size|swapon|swapoff/.test(script));
}
function executarQa() {
  const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-rh-pedidos-centros-20261021.sh'), 'utf8');
  validarRoteiro(script);
  for (const token of ['flock -n 9', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
    'p.ALLOW_SCHEMA_MIGRATIONS', 'node - --pacotes "$base_prod" "$versao_prod"', 'validarRhDemissaoConclusao.js']) {
    assert.throws(() => validarRoteiro(script.replace(token, 'GUARDA_REMOVIDA')), { name: 'AssertionError' }, token);
  }
  assert.throws(() => validarRoteiro(script.replace('pm2 restart backend-solicitacoes', 'pm2 restart backend-dev')));
  const pkg = { dependencies: { fixture: '1' }, scripts: { antigo: 'node antigo' } };
  validarPacotes(pkg, { ...pkg, scripts: { ...pkg.scripts, [novosScripts[0]]: 'node qa' } });
  for (const alvo of [{ ...pkg, dependencies: { fixture: '2' } },
    { ...pkg, scripts: { antigo: 'mudou' } }, { ...pkg, scripts: { ...pkg.scripts, postinstall: 'proibido' } }]) {
    assert.throws(() => validarPacotes(pkg, alvo));
  }
  console.log('Deploy PROD RH/pedidos/centros aprovado: SHA/base/ff-only/backup/timer/PM28000, runtime limitado, pacotes somente QA, UUID/TLS/schema/12h/flags readonly, regressoes antes do restart exclusivo PROD e .env preservado. Negativas testadas.');
}
if (process.argv[2] === '--pacotes') {
  const [base, alvo] = process.argv.slice(3);
  assert(base === baseProd && /^[0-9a-f]{40}$/.test(alvo || ''), 'SHAs invalidos');
  for (const pkg of ['backend/package.json', 'frontend/package.json']) {
    const ler = sha => JSON.parse(cp.execFileSync('git', ['show', `${sha}:${pkg}`], { encoding: 'utf8' }));
    validarPacotes(ler(base), ler(alvo));
  }
  console.log('Pacotes PROD conferidos: somente tres novos comandos de QA, sem dependencias ou scripts antigos alterados.');
} else if (require.main === module) executarQa();
module.exports = { validarPacotes, validarRoteiro, executarQa };
