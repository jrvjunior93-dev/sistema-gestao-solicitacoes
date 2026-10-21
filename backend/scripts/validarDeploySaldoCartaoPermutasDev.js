'use strict';
// Valida o roteiro como texto, sem shell/PM2/DB/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-saldo-cartao-permutas-20261021.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only');
const restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
for (const guarda of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
  'test "$(git branch --show-current)" = refactor/frontend',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001', 'p.ALLOW_SCHEMA_MIGRATIONS',
  'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor "$base_dev" HEAD',
  'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
  'git diff --quiet "$base_dev" "$versao_dev" -- backend/migrations',
  'backend/package-lock.json frontend/package.json frontend/package-lock.json',
  'git diff --quiet "$base_dev" "$versao_dev" -- backend/src',
  "':(exclude)backend/src/services/pagamentoManualFilaService.js'",
  "':(exclude)backend/src/services/permutaRelatorioService.js'", "require('node:sqlite')"]) {
  assert(script.indexOf(guarda) >= 0 && script.indexOf(guarda) < merge, guarda);
}
assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
for (const teste of ['validarDeploySaldoCartaoPermutasDev.js', 'validarCartaoParcelamentoBaixa.js',
  'validarFilaPrevisaoCartao.js', 'validarCartaoOpcionalSolicitacao.js', 'validarBloqueioProprietario.js',
  'validarFilaLiquidacaoRateada.js', 'validarFilaBaixaComposta.js', 'validarCarteiraChequesBaixaComposta.js',
  'validarFilaEstornoPermissao.js', 'validarPermutasRelatorio.js', 'validarPermutasOperacionais.js',
  'validarDeployPermutasDev.js', 'verificarPermutasMySqlDev.js --verificar']) {
  assert(script.indexOf(teste) > merge && script.indexOf(teste) < restart, teste);
}
assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
assert(script.includes('http://127.0.0.1:8001/health'));
assert.equal((script.match(/pm2 restart/g) || []).length, 1);
assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
console.log('OK: deploy saldo cartao/permutas DEV com SHA/base/fast-forward, PM2 online/porta/watch, schema readonly, runtime limitado, MySQL readonly antes do restart e .env por hash. Sem DDL/instalacao/producao.');
