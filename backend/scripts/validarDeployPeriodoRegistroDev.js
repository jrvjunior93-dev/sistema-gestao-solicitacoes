'use strict';
// Roteiro como texto: nao executa shell/EC2/PM2/DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-periodo-registro-20261021.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only');
const restart = script.indexOf('env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev');
for (const guarda of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
  'base_dev=44ee71b28b712b47e40b2c5aafad981fe27673c2',
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
  'git diff --quiet "$base_dev" "$versao_dev" -- backend/src',
  "':(exclude)backend/src/controllers/SolicitacaoController.js'", "require('node:sqlite')"]) {
  assert(script.indexOf(guarda) >= 0 && script.indexOf(guarda) < merge, guarda);
}
assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
for (const teste of ['validarDeployPeriodoRegistroDev.js', 'validarPeriodoRegistroSolicitacoes.js',
  'validarPeriodoRegistroSolicitacoes.mjs', 'validarSolicitacaoDataVencimento.js',
  'validarEdicaoDadosSolicitacao.js', 'validarListaPreferencias.js',
  'validarCartaoParcelamentoBaixa.js', 'validarPermutasRelatorio.js']) {
  assert(script.indexOf(teste) > merge && script.indexOf(teste) < restart, teste);
}
assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 3);
assert(script.includes('http://127.0.0.1:8001/health'));
assert.equal((script.match(/pm2 restart/g) || []).length, 1);
assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
console.log('OK: deploy periodo de registro DEV com SHA/bases/fast-forward, PM2 online/8001/sem watch, schema readonly, runtime limitado, testes antes do restart e .env por hash. Sem DDL/instalacao/producao.');
