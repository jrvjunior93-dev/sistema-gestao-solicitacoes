'use strict';
// Roteiro PROD real em VM, sem EC2, banco, PM2 ou Git remoto reais.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-contrato-reprogramacao-20261023.sh'), 'utf8');
const blocos = s => [...s.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
function validar(s) {
  const merge = s.indexOf('git merge --ff-only'), restart = s.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > 0 && restart > merge);
  for (const token of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM',
    'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM', 'base_prod=8982855e006a332861aa3288abe1c3ccc6a5e631',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main', 'test "$(git branch --show-current)" = main',
    'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'git merge-base --is-ancestor "$versao_prod" origin/main', 'git merge-base --is-ancestor "$base_prod" HEAD',
    'git merge-base --is-ancestor HEAD "$versao_prod"', 'git merge-base --is-ancestor fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662 "$versao_prod"',
    'backend/package.json frontend/package.json backend/package-lock.json frontend/package-lock.json backend/migrations backend/scripts/promoverSchemaProducao20261018.js',
    "'M\\tbackend/src/services/contratoSaldoReprogramacaoService.js'", "'M\\tfrontend/src/components/contratos/ReprogramarSaldoContrato.jsx'",
    "'--diff-filter=D'", "require('node:sqlite')"]) assert(s.indexOf(token) > 0 && s.indexOf(token) < merge, token);
  const verificacoes = [...s.matchAll(/timeout 120s node scripts\/verificarFinanceiroProducao20261019.js --verificar/g)].map(m => m.index);
  assert.equal(verificacoes.length, 3); assert(verificacoes[0] < merge && verificacoes[1] > merge && verificacoes[1] < restart && verificacoes[2] > restart);
  const push = [...s.matchAll(/timeout 60s node scripts\/verificarReenvioAutorizacaoProducao.js --verificar/g)].map(m => m.index);
  assert.equal(push.length, 2); assert(push[0] < merge && push[1] > restart);
  for (const nome of ['validarDeployContratoReprogramacaoProducao.js', 'validarContratoSaldoReprogramacao.js', 'validarContratoMedicaoEncerramento.js',
    'validarGestaoContratosOperacional.js', 'validarContratoAditivoVigencia.js', 'validarContratoAditivoNegociacao.js',
    'validarAprovacaoExclusivaContrato.js', 'validarRetornoContratoAprovadoObra.js', 'validarMedicaoFavorecidos.js',
    'validarMedicaoValorPagamento.js', 'validarMedicaoRecargaFluxoPagamento.js', 'validarSegurancaAcessoDireto.js']) assert(s.indexOf(nome) > merge && s.indexOf(nome) < restart, nome);
  assert.equal((s.match(/pm2 restart/g) || []).length, 1);
  assert.equal((s.match(/test "\$env_hash_prod"/g) || []).length, 3);
  assert(s.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
  assert(s.includes('http://127.0.0.1:8000/health'));
  assert(!/--aplicar|--update-env|backend-dev|pm2 (?:reload|start|stop|delete)|npm (?:ci|install|run migrate)|\bgit reset\b|ALLOW_SCHEMA_MIGRATIONS=true|\bssh\b/.test(s));
}
function testarPm2(alterar = () => {}) {
  const ps = [{ name: 'backend-solicitacoes', pm2_env: { pm_exec_path: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js', PORT: 8000, status: 'online', watch: false } }]; alterar(ps);
  vm.runInNewContext(blocos(source)[0], { require: name => {
    if (name === 'node:sqlite') return {};
    assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
      assert.equal(cmd, 'pm2'); assert.equal(JSON.stringify(args), '["jlist"]'); return JSON.stringify(ps);
    } };
  } });
}
function testarInventario({ arquivos = 'M\tbackend/src/services/contratoSaldoReprogramacaoService.js\nM\tfrontend/src/components/contratos/ReprogramarSaldoContrato.jsx', runtime = '', deletados = '' } = {}) {
  vm.runInNewContext(blocos(source)[1], { process: { argv: ['node', '-', 'base', 'alvo'] }, require(name) {
    if (name === 'node:assert/strict') return { deepEqual(a, b, m) { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); }, equal: assert.equal };
    assert.equal(name, 'node:child_process'); return { execFileSync(cmd, args) {
      assert.equal(cmd, 'git'); assert.equal(args[0], 'diff');
      if (args.includes('--name-status')) return arquivos;
      if (args.includes('--diff-filter=D')) return deletados;
      assert(args.includes('--exit-code')); assert.equal(args[2], 'fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662');
      if (runtime) throw Error('Runtime diverge do DEV'); return '';
    } };
  } });
}
function qa() {
  validar(source); assert.equal(blocos(source).length, 2); testarPm2(); testarInventario();
  for (const alterar of [ps => { ps.length = 0; }, ps => ps.push(ps[0]), ps => { ps[0].name = 'outro'; },
    ps => { ps[0].pm2_env.pm_exec_path = '/dev/server.js'; }, ps => { ps[0].pm2_env.PORT = 8001; },
    ps => { ps[0].pm2_env.status = 'stopped'; }, ps => { ps[0].pm2_env.watch = true; },
    ps => { ps[0].pm2_env.watch = ['src']; }, ps => { ps[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS = ' true '; }]) assert.throws(() => testarPm2(alterar));
  for (const dados of [{ arquivos: '' }, { runtime: 'diverge' }, { deletados: 'ops/arquivo-main.sh' }, { arquivos: 'D\tbackend/src/services/contratoSaldoReprogramacaoService.js' }]) assert.throws(() => testarInventario(dados));
  for (const token of ['flock -n 9', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
    'git merge-base --is-ancestor HEAD "$versao_prod"', 'validarContratoSaldoReprogramacao.js', 'backend/migrations', "'--diff-filter=D'"])
    assert.throws(() => validar(source.replace(token, 'GUARDA_REMOVIDA')));
  assert.throws(() => validar(source.replace('pm2 restart backend-solicitacoes', 'pm2 restart backend-dev')));
  console.log('OK PROD reprogramacao: SHA/base/ff-only/DEV homologado, backup/timer, PM28000/watch/DDL, preflight readonly/TLS/schema/12h/flags, inventario de dois runtimes, sem migrations/pacotes, exclusividades MAIN, QAs antes de restart exclusivo PROD e health. VM/negativas sem EC2/banco/rede.');
}
if (require.main === module) { try { qa(); } catch (e) { console.error(e); process.exitCode = 1; } }
module.exports = { qa, validar };
