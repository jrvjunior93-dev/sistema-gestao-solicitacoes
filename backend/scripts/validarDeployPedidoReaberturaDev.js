'use strict';
// Guarda de publicacao por texto/git. Nao carrega env/models nem acessa banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const novosScripts = ['test:pedido-reabertura', 'test:rhdp-demissao-conclusao', 'test:centro-custo-distribuicao'];
function validarPacotes(base, alvo) {
  const limpar = pkg => { const copia = JSON.parse(JSON.stringify(pkg));
    for (const key of novosScripts) delete copia.scripts?.[key]; return copia; };
  assert.deepEqual(limpar(alvo), limpar(base), 'package.json alterou algo alem dos comandos de QA publicados');
}
function validarRoteiro() {
  const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-pedido-reabertura-20261021.sh'), 'utf8');
  const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
  assert(merge > 0 && restart > merge);
  const antes = token => assert(script.indexOf(token) >= 0 && script.indexOf(token) < merge, token);
  for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
    'base_dev=2d161b85efd1e673ffcf7c36b25b94a1fc9a5122', 'base_instalada=828ed2ecd6478df54ff859c306b2ffac1a9ea9c9',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001',
    "p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'",
    'p.ALLOW_SCHEMA_MIGRATIONS', 'process.env.ALLOW_SCHEMA_MIGRATIONS',
    'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git merge-base --is-ancestor "$base_instalada" HEAD', 'git merge-base --is-ancestor "$base_dev" "$versao_dev"',
    'git merge-base --is-ancestor HEAD "$versao_dev"',
    'git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json',
    'node - --pacotes "$base_instalada" "$versao_dev"',
    'git diff --quiet "$base_dev" "$versao_dev" -- backend/src',
    'git diff --quiet "$base_dev" "$versao_dev" -- frontend/src']) antes(token);
  for (const arquivo of ['services/pedidoCompraService.js', 'controllers/PedidoCompraController.js', 'observability/pedidoCompraOperacao.js']) {
    antes(`':(exclude)backend/src/${arquivo}'`);
    assert(script.lastIndexOf(`src/${arquivo}`) > merge && script.lastIndexOf(`src/${arquivo}`) < restart);
  }
  antes("':(exclude)frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx'");
  for (const teste of ['validarPedidoReabertura.js', 'validarPrevisaoEntregaCotacao.js', 'validarCompraRemanejamento.js',
    'validarComprasPerformanceFases.js', 'validarPedidoEntregas.js', 'validarPedidoEntregasAcesso.js',
    'validarCompraOfertaSaldoMesmoFornecedor.js', 'validarEncerramentoSemPedidoHistorico.js',
    'validarRhDemissaoConclusao.js', 'validarDistribuicaoCentroCustoDestinos.js']) {
    assert(script.indexOf(teste) > merge && script.indexOf(teste) < restart, teste);
  }
  assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
  assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
  assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert.equal((script.match(/pm2 restart/g) || []).length, 1);
  assert(script.includes('http://127.0.0.1:8001/health'));
  assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|--max-old-space-size|swapon|swapoff/.test(script));
  const pacote = { dependencies: { fixture: '1' }, scripts: { antigo: 'node antigo' } };
  validarPacotes(pacote, { ...pacote, scripts: { ...pacote.scripts, [novosScripts[0]]: 'node qa' } });
  for (const alvo of [{ ...pacote, dependencies: { fixture: '2' } },
    { ...pacote, scripts: { antigo: 'mudou' } }, { ...pacote, scripts: { ...pacote.scripts, postinstall: 'nao permitido' } }]) {
    assert.throws(() => validarPacotes(pacote, alvo));
  }
  console.log('Deploy pedido DEV aprovado: SHA/ff-only, PM2/8001, identidade/schema readonly, runtime limitado, pacotes so QA, testes antes do restart exclusivo DEV, .env e memoria preservados.');
}
if (process.argv[2] === '--pacotes') {
  const [base, alvo] = process.argv.slice(3);
  assert(/^[0-9a-f]{40}$/.test(base || '') && /^[0-9a-f]{40}$/.test(alvo || ''), 'SHAs invalidos');
  for (const pkg of ['backend/package.json', 'frontend/package.json']) {
    const ler = sha => JSON.parse(cp.execFileSync('git', ['show', `${sha}:${pkg}`], { encoding: 'utf8' }));
    validarPacotes(ler(base), ler(alvo));
  }
  console.log('Pacotes conferidos: somente comandos de QA novos; sem dependencias ou scripts de instalacao alterados.');
} else if (require.main === module) validarRoteiro();
module.exports = { validarPacotes, validarRoteiro };
