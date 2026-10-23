'use strict';
// Roteiro/guardas reais em VM; nenhuma EC2, Git remoto, PM2 ou banco real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-filtros-distribuicao-20261023.sh'), 'utf8');
const blocos = s => [...s.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
const permitidos = [
  'M\tbackend/src/controllers/DetalheLayoutController.js',
  'M\tbackend/src/controllers/PagamentoManualFilaController.js',
  'M\tbackend/src/controllers/SolicitacaoController.js',
  'M\tbackend/src/routes.js',
  'A\tbackend/src/services/pagamentoFilaAutocompleteService.js',
  'M\tbackend/src/services/pagamentoFilaFiltrosDomain.js',
  'A\tbackend/src/services/pagamentoFilaPesquisaDomain.js',
  'M\tbackend/src/services/pagamentoManualFilaService.js',
  'M\tbackend/src/validators/paymentValidators.js',
  'A\tfrontend/src/components/financeiro/FiltrosFilaPagamentos.jsx',
  'M\tfrontend/src/components/ui/ApropriacaoAutocomplete.jsx',
  'M\tfrontend/src/pages/FinanceiroFilaPagamentos.jsx',
  'A\tfrontend/src/pages/SolicitacaoDetalhe/DistribuicaoGerencial.jsx',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/blocosDetalhe.js',
  'M\tfrontend/src/pages/SolicitacaoDetalhe/index.jsx',
  'M\tfrontend/src/services/financeiro.js',
  'A\tfrontend/src/utils/distribuicaoGerencialSalva.mjs'
];
function validar(s) {
  const merge = s.indexOf('git merge --ff-only'), restart = s.indexOf('pm2 restart backend-dev');
  assert(merge > 0 && restart > merge);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
    'base_dev=fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_dev" HEAD', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'backend/package-lock.json frontend/package-lock.json backend/migrations',
    'const { scripts, ...resto }', 'assert.deepEqual(manifesto(base), manifesto(versao)', 'assert.deepEqual(arquivos, [']) {
    assert(s.indexOf(token) > 0 && s.indexOf(token) < merge, token);
  }
  const verificacoes = [...s.matchAll(/timeout 45s node scripts\/configurarSessao12hDev.js --verificar/g)].map(m => m.index);
  assert.equal(verificacoes.length, 3); assert(verificacoes[0] < merge && verificacoes[1] > merge && verificacoes[1] < restart && verificacoes[2] > restart);
  for (const nome of ['validarDeployFiltrosDistribuicaoDev.js', 'validarFilaFiltrosPesquisa.js --sem-sqlite',
    'validarSolicitacaoDistribuicaoGerencial.js', 'validarFilaFiltrosDp.js', 'validarFilaPaginacao.js', 'validarPerformanceFilaDp.js',
    'validarFilaDestinatarios.js', 'validarFilaBaixaEstorno.js', 'validarFilaComprovantePendente.js', 'validarFilaBaixaComposta.js',
    'validarFilaLiquidacaoRateada.js', 'validarDistribuicaoCentroCustoDestinos.js', 'validarAdiantamentoCentroCusto.js',
    'validarSegurancaAcessoDireto.js']) assert(s.indexOf(nome) > merge && s.indexOf(nome) < restart, nome);
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert(s.includes('env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev'));
  assert(s.includes('http://127.0.0.1:8001/health'));
  assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|\bgit reset\b|ALLOW_SCHEMA_MIGRATIONS=true/.test(s));
}
function testarPm2(alterar = () => {}) {
  const ps = [{ name: 'backend-dev', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: 8001, status: 'online', watch: false } }]; alterar(ps);
  vm.runInNewContext(blocos(source)[0], { require: name => {
    assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(ps);
    } };
  } });
}
function testarInventario(arquivos, alterarManifesto = () => {}) {
  vm.runInNewContext(blocos(source)[2], { process: { argv: ['node', '-', 'base', 'versao'] }, require(name) {
    if (name === 'node:assert/strict') return { deepEqual(a, b, m) { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); } };
    assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
      assert.equal(cmd, 'git');
      if (args[0] === 'show') {
        const manifesto = { name: 'qa', dependencies: { qa: '1.0.0' }, scripts: args[1].startsWith('base:') ? { anterior: 'qa' } : { anterior: 'qa', novo: 'qa2' } };
        if (args[1].startsWith('versao:')) alterarManifesto(manifesto);
        return JSON.stringify(manifesto);
      }
      assert.equal(JSON.stringify(args), '["diff","--name-status","base","versao","--","backend/src","frontend/src"]');
      return arquivos;
    } };
  } });
}
function qa() {
  validar(source); assert.equal(blocos(source).length, 3); testarPm2();
  for (const alterar of [ps => { ps.length = 0; }, ps => ps.push(ps[0]), ps => { ps[0].name = 'outro'; },
    ps => { ps[0].pm2_env.pm_exec_path = '/producao/server.js'; }, ps => { ps[0].pm2_env.PORT = 8000; },
    ps => { ps[0].pm2_env.status = 'stopped'; }, ps => { ps[0].pm2_env.watch = true; },
    ps => { ps[0].pm2_env.watch = ['src']; }, ps => { ps[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = ' true '; }]) assert.throws(() => testarPm2(alterar));
  for (const valor of [undefined, 'false', '0']) vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) });
  for (const valor of ['true', '1', 'yes', 'on', ' true ']) assert.throws(() => vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) }));
  const arquivos = permitidos.join('\n'); testarInventario(arquivos); testarInventario(arquivos.replaceAll('\n', '\r\n'));
  for (const invalido of ['', arquivos + '\nM\tbackend/src/services/tituloFinanceiroService.js', arquivos.replace('M\tbackend', 'D\tbackend'), arquivos.split('\n')[0]]) assert.throws(() => testarInventario(invalido));
  for (const alterar of [m => { m.dependencies.qa = '2.0.0'; }, m => { m.engines = { node: '>=24' }; }]) assert.throws(() => testarInventario(arquivos, alterar));
  for (const token of ['flock -n 9', 'git merge-base --is-ancestor HEAD "$versao_dev"', 'validarFilaFiltrosDp.js',
    'backend/migrations', 'assert.deepEqual(arquivos, [']) assert.throws(() => validar(source.replace(token, 'GUARDA_REMOVIDA')));
  assert.throws(() => validar(source.replace('pm2 restart backend-dev', 'pm2 restart backend-solicitacoes')));
  assert.throws(() => validar(source.replace('env -u CONFIRM_DEV_BACKUP', 'env --update-env -u CONFIRM_DEV_BACKUP')));
  console.log('OK deploy DEV filtros/distribuicao: SHA/ff-only/lock, PM2/8001/watch/DDL, preflight identidade/schema/sessao, inventario17, manifestos/QAs antes do restart exclusivo DEV e health. Negativas VM; sem EC2/banco/rede.');
}
if (require.main === module) { try { qa(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { qa, validar, permitidos };
