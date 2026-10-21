'use strict';
// Guarda da publicacao: texto/git apenas. Nao acessa banco, PM2, rede ou .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const novosScripts = ['test:rhdp-demissao-conclusao', 'test:centro-custo-distribuicao'];
function validarPacotes(base, alvo) {
  const limpar = pkg => { const copia = JSON.parse(JSON.stringify(pkg)); for (const key of novosScripts) delete copia.scripts?.[key]; return copia; };
  assert.deepEqual(limpar(alvo), limpar(base), 'package.json alterou algo alem dos dois comandos de QA autorizados');
}
function validarRoteiro() {
  const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-rh-centros-20261021.sh'), 'utf8');
  const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
  for (const guarda of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
    'base_dev=828ed2ecd6478df54ff859c306b2ffac1a9ea9c9', 'base_instalada=93f75d67f773b9687bbf7acb9cf4664243f42c84',
    'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
    'test "$(git branch --show-current)" = refactor/frontend', 'test -z "$(git status --porcelain --untracked-files=no)"',
    'flock -n 9', 'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001', 'p.ALLOW_SCHEMA_MIGRATIONS',
    'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor "$base_instalada" HEAD',
    'git merge-base --is-ancestor "$base_dev" "$versao_dev"', 'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
    'git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json',
    'node - --pacotes "$base_instalada" "$versao_dev"', 'git diff --quiet "$base_dev" "$versao_dev" -- backend/src',
    'git diff --quiet "$base_dev" "$versao_dev" -- frontend/src']) assert(script.indexOf(guarda) >= 0 && script.indexOf(guarda) < merge, guarda);
  for (const arquivo of ['services/rhDemissaoConclusaoDomain.js','services/rhSolicitacaoService.js',
    'services/rhSolicitacaoConsultaDomain.js','services/rhSolicitacaoPaginaService.js','services/rhService.js',
    'controllers/RhSolicitacaoController.js','routes.js','services/centroCustoDistribuicaoService.js',
    'controllers/SolicitacaoCentroCustoDistribuicaoController.js','controllers/DistribuicaoCentroCustoRelatorioController.js']) {
    assert(script.indexOf(`':(exclude)backend/src/${arquivo}'`) >= 0 && script.indexOf(`':(exclude)backend/src/${arquivo}'`) < merge);
    assert(script.lastIndexOf(`src/${arquivo}`) > merge && script.lastIndexOf(`src/${arquivo}`) < restart);
  }
  for (const teste of ['validarRhDemissaoConclusao.js','validarDistribuicaoCentroCustoDestinos.js','validarAdiantamentoCentroCusto.js',
    'validarAdiantamentoFavorecidos.js','validarCompraCentroCusto.js','validarRhPagamentoEnvioParcial.js']) {
    assert(script.indexOf(teste) > merge && script.indexOf(teste) < restart);
  }
  assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
  assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
  assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
  assert.equal((script.match(/pm2 restart/g) || []).length, 1);
  assert(script.includes('http://127.0.0.1:8001/health'));
  assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
  const exemplo = { dependencies: { fixture: '1' }, scripts: { antigo: 'node antigo' } };
  validarPacotes(exemplo, { ...exemplo, scripts: { ...exemplo.scripts, [novosScripts[0]]: 'node qa', [novosScripts[1]]: 'node qa2' } });
  assert.throws(() => validarPacotes(exemplo, { ...exemplo, dependencies: { fixture: '2' } }));
  assert.throws(() => validarPacotes(exemplo, { ...exemplo, scripts: { antigo: 'mudou' } }));
  assert.throws(() => validarPacotes(exemplo, { ...exemplo, scripts: { ...exemplo.scripts, postinstall: 'nao permitido' } }));
  console.log('Roteiro DEV aprovado: SHA/ancestralidade/ff-only, runtime limitado, PM2 online/8001/sem watch, schema readonly, pacotes so QA, regressoes antes do restart exclusivo DEV e .env preservado.');
}
if (process.argv[2] === '--pacotes') {
  const [base, alvo] = process.argv.slice(3);
  assert(/^[0-9a-f]{40}$/.test(base || '') && /^[0-9a-f]{40}$/.test(alvo || ''), 'SHAs invalidos');
  for (const pkg of ['backend/package.json', 'frontend/package.json']) {
    const ler = sha => JSON.parse(cp.execFileSync('git', ['show', `${sha}:${pkg}`], { encoding: 'utf8' }));
    validarPacotes(ler(base), ler(alvo));
  }
  console.log('Pacotes conferidos: somente dois comandos de QA novos; sem dependencias ou scripts de instalacao alterados.');
} else if (require.main === module) validarRoteiro();
module.exports = { validarPacotes, validarRoteiro };
