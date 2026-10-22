'use strict';
// QA puro texto/git. Nao importa env/models nem conecta DB/PM2/integracoes.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const BASE_PROD = 'b6546229e3bbec9db2b01162ebfd21808a33481e';
function validarPacote(base, alvo, runtime) {
  const comando = `node scripts/validarOfxMatchesExclusivos.${runtime === 'backend' ? 'js' : 'mjs'}`;
  const prevista = `node scripts/validarFormaPrevistaContratoReceber.${runtime === 'backend' ? 'js' : 'mjs'}`;
  assert.deepEqual(alvo, { ...base, scripts: { ...base.scripts, 'test:ofx-matches-exclusivos': comando,
    'test:receber-forma-prevista': prevista } },
    'Pacote deve preservar dependencias/scripts MAIN e adicionar somente os dois QAs exatos');
}
function validarRoteiro(script) {
  const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('pm2 restart backend-solicitacoes');
  assert(merge > 0 && restart > merge);
  const antes = token => assert(script.indexOf(token) >= 0 && script.indexOf(token) < merge, token);
  for (const token of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]',
    'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
    `base_prod=${BASE_PROD}`, 'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main',
    'test "$(git branch --show-current)" = main', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    "p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'",
    "p.status !== 'online'", 'p.watch', 'Number(p.PORT) !== 8000', 'p.ALLOW_SCHEMA_MIGRATIONS',
    "require('node:sqlite')", 'git merge-base --is-ancestor "$versao_prod" origin/main',
    'git merge-base --is-ancestor "$base_prod" HEAD', 'git merge-base --is-ancestor HEAD "$versao_prod"',
    'git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations backend/package-lock.json frontend/package-lock.json',
    'node - --pacotes "$base_prod" "$versao_prod"', 'git diff --quiet "$base_prod" "$versao_prod" -- backend/src',
    'git diff --quiet "$base_prod" "$versao_prod" -- frontend/src']) antes(token);
  for (const nome of ['services/conciliacaoBancariaService.js', 'services/conciliacaoGruposMatch.js',
    'services/tituloFinanceiroService.js', 'services/tituloFormaPrevistaLeitura.js']) {
    antes(`':(exclude)backend/src/${nome}'`);
    assert(script.lastIndexOf(`node --check src/${nome}`) > merge && script.lastIndexOf(`node --check src/${nome}`) < restart);
  }
  for (const nome of ['pages/FinanceiroConciliacao.jsx', 'utils/conciliacaoAlocacao.js',
    'pages/FinanceiroTitulos.jsx', 'utils/formaPagamentoTitulo.js']) antes(`':(exclude)frontend/src/${nome}'`);
  for (const nome of ['verificarFinanceiroProducao20261019.js', 'verificarReenvioAutorizacaoProducao.js']) {
    antes(`${nome} --verificar`);
    assert(script.lastIndexOf(`${nome} --verificar`) > restart);
    assert.equal(script.split(`${nome} --verificar`).length - 1, 3);
  }
  for (const nome of ['validarDeployOfxReceberProducao.js', 'validarOfxMatchesExclusivos.js',
    'validarConciliacaoMatchesExatos.js', 'validarConciliacaoRendimentos.js',
    'validarCarteiraChequesBaixaComposta.js', 'validarOfxObrasFinanceiro.js',
    'validarFormaPrevistaContratoReceber.js', 'validarRelatorioTitulosSelecao.js',
    'validarCartaoOpcionalSolicitacao.js', 'validarCartaoParcelamentoBaixa.js',
    'validarFilaBaixaComposta.js', 'validarRelatorioTitulosSolicitacao.js',
    'validarComercialTituloVencimento.js', 'validarComercialChequeQuitacao.js',
    'validarComercialContratosMultiunidadeImportacao.js']) {
    const i = script.indexOf(nome, merge); assert(i > merge && i < restart, nome);
  }
  assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
  assert.equal((script.match(/pm2 restart/g) || []).length, 1);
  assert.equal((script.match(/test "\$env_hash_prod"/g) || []).length, 3);
  assert.equal((script.match(/systemctl is-active/g) || []).length, 2);
  assert(script.includes('http://127.0.0.1:8000/health'));
  assert(script.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
  assert(!/--aplicar|--update-env|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|backend-dev|\bgit reset\b|--max-old-space-size|swapon|swapoff/.test(script));
}
function executarQa() {
  const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-ofx-receber-20261022.sh'), 'utf8');
  validarRoteiro(script);
  for (const token of ['flock -n 9', 'test "${CONFIRM_PROD_BACKUP:-}" = SIM',
    'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM', 'p.ALLOW_SCHEMA_MIGRATIONS',
    'node - --pacotes "$base_prod" "$versao_prod"', 'validarOfxMatchesExclusivos.js',
    'git merge-base --is-ancestor "$base_prod" HEAD', 'test "$(git branch --show-current)" = main']) {
    assert.throws(() => validarRoteiro(script.replace(token, 'GUARDA_REMOVIDA')), { name: 'AssertionError' }, token);
  }
  assert.throws(() => validarRoteiro(script.replace('pm2 restart backend-solicitacoes', 'pm2 restart backend-dev')));
  const base = { dependencies: { fixture: '1' }, scripts: { antigo: 'node antigo' } };
  for (const runtime of ['backend', 'frontend']) {
    const comando = `node scripts/validarOfxMatchesExclusivos.${runtime === 'backend' ? 'js' : 'mjs'}`;
    const prevista = `node scripts/validarFormaPrevistaContratoReceber.${runtime === 'backend' ? 'js' : 'mjs'}`;
    const valido = { ...base, scripts: { ...base.scripts, 'test:ofx-matches-exclusivos': comando, 'test:receber-forma-prevista': prevista } };
    validarPacote(base, valido, runtime);
    for (const alterado of [{ ...valido, dependencies: { fixture: '2' } },
      { ...valido, scripts: { ...valido.scripts, antigo: 'mudou' } },
      { ...valido, scripts: { ...valido.scripts, postinstall: 'proibido' } },
      { ...valido, scripts: { ...valido.scripts, 'test:ofx-matches-exclusivos': 'node outro' } },
      { ...valido, scripts: { ...valido.scripts, 'test:receber-forma-prevista': 'node outro' } }]) {
      assert.throws(() => validarPacote(base, alterado, runtime));
    }
  }
  console.log('Deploy PROD OFX/Receber aprovado: SHA/base/ff-only/backup/timer/PM28000, runtime limitado, dois QAs exatos, UUID/TLS/schema/sessao/flags readonly, regressoes antes do restart exclusivo PROD e .env preservado. Negativas aprovadas.');
}
if (process.argv[2] === '--pacotes') {
  const [base, alvo] = process.argv.slice(3);
  assert(base === BASE_PROD && /^[0-9a-f]{40}$/.test(alvo || ''), 'SHAs invalidos');
  for (const runtime of ['backend', 'frontend']) {
    const ler = sha => JSON.parse(cp.execFileSync('git', ['show', `${sha}:${runtime}/package.json`], { encoding: 'utf8' }));
    validarPacote(ler(base), ler(alvo), runtime);
  }
  console.log('Pacotes PROD conferidos: apenas dois novos QAs; dependencias e scripts MAIN preservados.');
} else if (require.main === module) executarQa();
module.exports = { validarPacote, validarRoteiro, executarQa };
