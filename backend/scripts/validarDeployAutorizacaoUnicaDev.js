'use strict';
// Verifica o roteiro como texto; nao executa shell, EC2, banco ou PM2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-autorizacao-unica-20261021.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only');
const restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
for (const guarda of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
  'base_dev=771f804189a7559c05df3f6bc1fd06fe17a65e50',
  'base_instalada=93f75d67f773b9687bbf7acb9cf4664243f42c84',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
  'test "$(git branch --show-current)" = refactor/frontend',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'p.watch', "p.status !== 'online'", 'Number(p.PORT) !== 8001', 'p.ALLOW_SCHEMA_MIGRATIONS',
  'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor "$base_instalada" HEAD',
  'git merge-base --is-ancestor "$base_dev" "$versao_dev"',
  'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
  'git diff --quiet "$base_instalada" "$versao_dev" -- backend/migrations',
  'backend/package-lock.json frontend/package.json frontend/package-lock.json',
  'git diff --quiet "$base_dev" "$versao_dev" -- backend/src', "require('node:sqlite')"]) {
  assert(script.indexOf(guarda) >= 0 && script.indexOf(guarda) < merge, guarda);
}
for (const arquivo of ['services/pagamentoAutorizacaoSelecaoService.js', 'services/pagamentoAutorizacaoService.js',
  'services/pagamentoManualFilaService.js', 'controllers/PagamentoAutorizacaoController.js', 'routes.js']) {
  const exclusao = script.indexOf(`':(exclude)backend/src/${arquivo}'`);
  assert(exclusao >= 0 && exclusao < merge);
  assert(script.indexOf(`node --check src/${arquivo}`) > merge && script.indexOf(`node --check src/${arquivo}`) < restart);
}
assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
for (const teste of ['validarDeployAutorizacaoUnicaDev.js', 'validarAutorizacaoSelecao.js',
  'validarFilaDiretaProprietario.js', 'validarBloqueioProprietario.js', 'validarPainelAutorizacoes.js',
  'validarTitulosExcluidosAutorizacao.js', 'validarReenvioAutorizacaoPush.js', 'validarCartaoParcelamentoBaixa.js']) {
  assert(script.indexOf(teste) > merge && script.indexOf(teste) < restart, teste);
}
assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
assert(script.includes('http://127.0.0.1:8001/health'));
assert.equal((script.match(/pm2 restart/g) || []).length, 1);
assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
console.log('OK: roteiro DEV com SHA/bases/fast-forward, identidade/schema readonly, PM2 online/8001/sem watch, runtime limitado, regressoes antes do restart e .env preservado. Sem DDL/dependencias/producao.');
