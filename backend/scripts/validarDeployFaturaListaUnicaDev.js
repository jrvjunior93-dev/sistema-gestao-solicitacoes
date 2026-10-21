'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-fatura-lista-unica-20261021.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only');
for (const guarda of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
  'test "$(git branch --show-current)" = refactor/frontend',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'p.watch', "p.status !== 'online'", "Number(p.PORT) !== 8001",
  'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor "$base_dev" HEAD',
  'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend',
  'git diff --quiet "$base_dev" "$versao_dev" -- backend/src backend/migrations',
  'backend/package-lock.json frontend/package.json frontend/package-lock.json']) {
  assert(script.indexOf(guarda) >= 0 && script.indexOf(guarda) < merge, guarda);
}
assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
for (const teste of ['validarDeployFaturaListaUnicaDev.js', 'validarFaturaItensUnificados.mjs']) assert(script.indexOf(teste) > merge, teste);
assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > merge);
assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
assert.equal((script.match(/test "\$env_hash_dev"/g) || []).length, 2);
assert(script.includes('http://127.0.0.1:8001/health'));
assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:restart|reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
console.log('OK: deploy fatura DEV com SHA/base/fast-forward, guardas antes do merge, PM2 online/watch/porta, .env por hash e schema somente leitura. Sem instalacao/reinicio/DDL/EC2/rede.');
