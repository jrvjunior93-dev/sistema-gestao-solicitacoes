'use strict';
// Guarda textual e blocos reais em VM. Sem PM2/DB/rede/arquivos externos reais.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-recarga-saldo-20261023.sh'), 'utf8');
function validar(s) {
  const merge = s.indexOf('git merge --ff-only'), restart = s.indexOf('pm2 restart backend-dev');
  assert(merge > 0 && restart > merge);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
    'base_dev=c44b1adda96a76c544ca51d8669726a8fd8dc7d1',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_dev" HEAD', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json backend/migrations',
    'backend/src/services/cartaoRecargaSaldoService.js backend/src/services/recargaCartaoService.js backend/src/services/authorizationService.js backend/src/services/solicitacaoRetornoService.js frontend/src/components/recarga-cartao/PrestacaoRecargaCartao.jsx']) {
    assert(s.indexOf(token) > 0 && s.indexOf(token) < merge, token);
  }
  const checks = [...s.matchAll(/timeout 45s node scripts\/configurarSessao12hDev.js --verificar/g)].map(m => m.index);
  assert.equal(checks.length, 3); assert(checks[0] < merge && checks[1] > merge && checks[1] < restart && checks[2] > restart);
  for (const token of ['validarDeployRecargaSaldoDev.js', 'validarRecargaSaldoOrigens.js', 'validarRecargasMultiplosCartoes.js',
    'validarRecargaRegularizacao.js', 'validarMedicaoRecargaFluxoPagamento.js', 'validarSegurancaAcessoDireto.js',
    'validarAcessoAnexosSolicitacoes.js', 'validarSaldoCartaoSchemaLimiteDp.js']) {
    assert(s.indexOf(token) > merge && s.indexOf(token) < restart, token);
  }
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert(s.includes('env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev'));
  assert(s.includes('http://127.0.0.1:8001/health'));
  assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|\bgit reset\b|ALLOW_SCHEMA_MIGRATIONS=true|swapon|swapoff/.test(s));
}
function blocos(s) { return [...s.matchAll(/node <<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]); }
function testarPm2(alterar = () => {}) {
  const ps = [{ name: 'backend-dev', pm2_env: {
    pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js', PORT: 8001, status: 'online', watch: false
  } }]; alterar(ps);
  vm.runInNewContext(blocos(source)[0], { require: name => {
    assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(ps);
    } };
  } });
}
function qa() {
  validar(source); assert.equal(blocos(source).length, 2); testarPm2();
  for (const mudar of [ps => { ps.length = 0; }, ps => { ps.push(ps[0]); }, ps => { ps[0].name = 'outro'; },
    ps => { ps[0].pm2_env.pm_exec_path = '/producao/server.js'; }, ps => { ps[0].pm2_env.PORT = 8000; },
    ps => { ps[0].pm2_env.status = 'stopped'; }, ps => { ps[0].pm2_env.watch = true; },
    ps => { ps[0].pm2_env.watch = ['src']; }, ps => { ps[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = 'true'; },
    ps => { ps[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = ' true '; }]) {
    assert.throws(() => testarPm2(mudar));
  }
  for (const valor of [undefined, 'false', '0']) {
    vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) });
  }
  for (const valor of ['true', '1', 'yes', 'on', ' true ']) {
    assert.throws(() => vm.runInNewContext(blocos(source)[1], { process: { env: { ALLOW_SCHEMA_MIGRATIONS: valor } }, require: () => ({}) }));
  }
  for (const token of ['flock -n 9', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'validarRecargaSaldoOrigens.js', 'backend/migrations', 'backend/src/services/cartaoRecargaSaldoService.js']) {
    assert.throws(() => validar(source.replace(token, 'GUARDA_REMOVIDA')));
  }
  assert.throws(() => validar(source.replace('pm2 restart backend-dev', 'pm2 restart backend-solicitacoes')));
  assert.throws(() => validar(source.replace('env -u CONFIRM_DEV_BACKUP', 'env --update-env -u CONFIRM_DEV_BACKUP')));
  console.log('OK deploy DEV saldo: SHA/ff-only/checkout, lock/PM2/8001/watch/DDL, preflight de identidade/schema/sessao, dependencias/migrations/motores intactos, testes antes do restart exclusivo DEV e health. Blocos em VM/negativas; sem EC2/DB/rede.');
}
if (require.main === module) { try { qa(); } catch (e) { console.error(e); process.exitCode = 1; } }
module.exports = { qa, validar };
