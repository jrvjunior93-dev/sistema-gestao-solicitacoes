'use strict';
// Guarda pura texto/git: sem env/models/DB/PM2 reais.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const BASE_DEV = 'a00a15f6fdd573fcff18e87c3d1e7d411dcb181a';
function validarPacote(base, alvo, runtime) {
  const comando = runtime === 'backend' ? 'node scripts/validarFormaPrevistaContratoReceber.js'
    : 'node scripts/validarFormaPrevistaContratoReceber.mjs';
  assert.deepEqual(alvo, { ...base, scripts: { ...base.scripts, 'test:receber-forma-prevista': comando } },
    'Somente o comando de QA desta publicacao pode mudar no package.json');
}
function validarRoteiro(script) {
  const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
  assert(merge > 0 && restart > merge);
  const antes = token => assert(script.indexOf(token) >= 0 && script.indexOf(token) < merge, token);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]', `base_dev=${BASE_DEV}`,
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001',
    "p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'",
    'p.ALLOW_SCHEMA_MIGRATIONS', 'process.env.ALLOW_SCHEMA_MIGRATIONS',
    'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_dev" HEAD', 'git merge-base --is-ancestor HEAD "$versao_dev"',
    'git diff --quiet "$base_dev" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json',
    'node - --pacotes "$base_dev" "$versao_dev"', 'git diff --quiet "$base_dev" "$versao_dev" -- backend/src',
    'git diff --quiet "$base_dev" "$versao_dev" -- frontend/src']) antes(token);
  for (const nome of ['services/tituloFinanceiroService.js', 'services/tituloFormaPrevistaLeitura.js']) {
    antes(`':(exclude)backend/src/${nome}'`);
    assert(script.lastIndexOf(`node --check src/${nome}`) > merge && script.lastIndexOf(`node --check src/${nome}`) < restart);
  }
  for (const nome of ['pages/FinanceiroTitulos.jsx', 'utils/formaPagamentoTitulo.js']) antes(`':(exclude)frontend/src/${nome}'`);
  for (const teste of ['validarDeployReceberFormaPrevistaDev.js', 'validarFormaPrevistaContratoReceber.js',
    'validarRelatorioTitulosSelecao.js', 'validarCartaoOpcionalSolicitacao.js', 'validarCartaoParcelamentoBaixa.js',
    'validarFilaBaixaComposta.js', 'validarRelatorioTitulosSolicitacao.js', 'validarComercialTituloVencimento.js',
    'validarComercialChequeQuitacao.js', 'validarComercialContratosMultiunidadeImportacao.js']) {
    const i = script.indexOf(teste, merge); assert(i > merge && i < restart, teste);
  }
  antes('configurarSessao12hDev.js --verificar');
  assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
  assert.equal(script.split('configurarSessao12hDev.js --verificar').length - 1, 3);
  assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
  assert.equal((script.match(/pm2 restart/g) || []).length, 1);
  assert(script.includes('http://127.0.0.1:8001/health'));
  assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|--max-old-space-size|swapon|swapoff|\bgit reset\b/.test(script));
}
function executarQa() {
  const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-receber-forma-prevista-20261022.sh'), 'utf8');
  validarRoteiro(script);
  for (const token of ['flock -n 9', 'p.ALLOW_SCHEMA_MIGRATIONS', 'node - --pacotes "$base_dev" "$versao_dev"',
    'validarFormaPrevistaContratoReceber.js', 'git merge-base --is-ancestor "$base_dev" HEAD']) {
    assert.throws(() => validarRoteiro(script.replace(token, 'GUARDA_REMOVIDA')), { name: 'AssertionError' }, token);
  }
  assert.throws(() => validarRoteiro(script.replace('pm2 restart backend-dev', 'pm2 restart backend-solicitacoes')));
  const base = { dependencies: { fixture: '1' }, scripts: { antigo: 'node antigo' } };
  for (const runtime of ['backend', 'frontend']) {
    const comando = `node scripts/validarFormaPrevistaContratoReceber.${runtime === 'backend' ? 'js' : 'mjs'}`;
    const valido = { ...base, scripts: { ...base.scripts, 'test:receber-forma-prevista': comando } };
    validarPacote(base, valido, runtime);
    for (const alterado of [{ ...valido, dependencies: { fixture: '2' } },
      { ...valido, scripts: { ...valido.scripts, antigo: 'mudou' } },
      { ...valido, scripts: { ...valido.scripts, postinstall: 'proibido' } },
      { ...valido, scripts: { ...valido.scripts, 'test:receber-forma-prevista': 'node outro' } }]) {
      assert.throws(() => validarPacote(base, alterado, runtime));
    }
  }
  console.log('Deploy DEV forma prevista aprovado: SHA/base/ff-only/PM2 online8001/sem watch, identidade/schema readonly, runtime limitado, pacotes somente QA exato, testes antes do restart exclusivo DEV, .env/memoria preservados. Negativas aprovadas.');
}
if (process.argv[2] === '--pacotes') {
  const [base, alvo] = process.argv.slice(3);
  assert(base === BASE_DEV && /^[0-9a-f]{40}$/.test(alvo || ''), 'SHAs invalidos');
  for (const runtime of ['backend', 'frontend']) {
    const ler = sha => JSON.parse(cp.execFileSync('git', ['show', `${sha}:${runtime}/package.json`], { encoding: 'utf8' }));
    validarPacote(ler(base), ler(alvo), runtime);
  }
  console.log('Pacotes DEV conferidos: so QA exato de forma prevista, sem dependencias/scripts anteriores alterados.');
} else if (require.main === module) executarQa();
module.exports = { validarPacote, validarRoteiro, executarQa };
