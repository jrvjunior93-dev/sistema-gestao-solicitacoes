'use strict';
// Roteiro e blocos reais em VM; sem PM2, banco, Git remoto ou EC2 reais.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-fila-destinatarios-20261023.sh'), 'utf8');
const blocos = s => [...s.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
function validar(s) {
  const merge = s.indexOf('git merge --ff-only'), restart = s.indexOf('pm2 restart backend-dev');
  assert(merge > 0 && restart > merge);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
    'base_dev=5123de39c4eb5ad6ac1131d3719fc69440648196',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_dev" HEAD', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'backend/package-lock.json frontend/package-lock.json backend/migrations',
    'backend/src/services/tituloFinanceiroService.js backend/src/services/authorizationService.js',
    'backend/src/services/instrucaoFinanceiraFavorecidoService.js backend/src/services/medicaoContratoService.js',
    'backend/src/services/tituloRenegociacaoService.js backend/src/services/tituloCompartilhadoPagamento.js',
    'assert.deepEqual(manifesto(base), manifesto(versao)']) assert(s.indexOf(token) > 0 && s.indexOf(token) < merge, token);
  const verificacoes = [...s.matchAll(/timeout 45s node scripts\/configurarSessao12hDev.js --verificar/g)].map(m => m.index);
  assert.equal(verificacoes.length, 3); assert(verificacoes[0] < merge && verificacoes[1] > merge && verificacoes[1] < restart && verificacoes[2] > restart);
  for (const nome of ['validarDeployFilaDestinatariosDev.js', 'validarFilaDestinatarios.js', 'validarTituloDadosPagamento.js',
    'validarFilaFiltrosDp.js', 'validarFilaPaginacao.js', 'validarFilaComprovantePendente.js', 'validarFilaBaixaComposta.js',
    'validarFilaLiquidacaoRateada.js', 'validarFilaBaixaEstorno.js', 'validarMedicaoFavorecidos.js',
    'validarMedicaoRecargaFluxoPagamento.js', 'validarTituloNegociacaoPagamento.js', 'validarTituloCancelamento.js',
    'validarSegurancaAcessoDireto.js', 'validarFilaPagamentoSolicitacaoAcesso.js']) assert(s.indexOf(nome) > merge && s.indexOf(nome) < restart, nome);
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
function qa() {
  validar(source); assert.equal(blocos(source).length, 3); testarPm2();
  for (const alterar of [ps => { ps.length = 0; }, ps => ps.push(ps[0]), ps => { ps[0].name = 'outro'; },
    ps => { ps[0].pm2_env.pm_exec_path = '/producao/server.js'; }, ps => { ps[0].pm2_env.PORT = 8000; },
    ps => { ps[0].pm2_env.status = 'stopped'; }, ps => { ps[0].pm2_env.watch = true; },
    ps => { ps[0].pm2_env.watch = ['src']; }, ps => { ps[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = ' true '; }]) assert.throws(() => testarPm2(alterar));
  for (const valor of [undefined, 'false', '0']) vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) });
  for (const valor of ['true', '1', 'yes', 'on', ' true ']) assert.throws(() => vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) }));
  const manifesto = (mudar = false) => vm.runInNewContext(blocos(source)[2], {
    process: { argv: ['node', '-', 'base', 'versao'] }, require(name) {
      if (name === 'node:assert/strict') return assert;
      assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
        assert.equal(cmd, 'git'); assert.equal(args[0], 'show');
        return JSON.stringify({ name: 'qa', dependencies: { sequelize: mudar && args[1].startsWith('versao:') ? 'nova' : 'mesma' }, scripts: { qa: args[1] } });
      } };
    }
  });
  manifesto(); assert.throws(() => manifesto(true));
  for (const token of ['flock -n 9', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'validarTituloDadosPagamento.js', 'backend/migrations', 'backend/src/services/tituloFinanceiroService.js']) assert.throws(() => validar(source.replace(token, 'GUARDA_REMOVIDA')));
  assert.throws(() => validar(source.replace('pm2 restart backend-dev', 'pm2 restart backend-solicitacoes')));
  assert.throws(() => validar(source.replace('env -u CONFIRM_DEV_BACKUP', 'env --update-env -u CONFIRM_DEV_BACKUP')));
  console.log('OK deploy DEV destinatarios: SHA/ff-only/checkout/lock, PM2/8001/watch/DDL, preflight identidade/schema/sessao, manifests/dependencias/motores preservados, QAs antes do restart exclusivo DEV e health. Negativas em VM; sem EC2/banco/rede.');
}
if (require.main === module) { try { qa(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { qa, validar };
