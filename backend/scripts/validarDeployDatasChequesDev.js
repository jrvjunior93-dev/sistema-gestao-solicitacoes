'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-datas-cheques-20261019.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('pm2 restart backend-dev');
assert(script.indexOf('p.watch') < merge);
assert(script.indexOf('configurarSessao12hDev.js --verificar') < merge);
assert(script.indexOf('validarDatasCheques.js') > merge && script.indexOf('validarDatasCheques.js') < restart);
assert(script.indexOf('validarChequesLoteContrato.js') > merge && script.indexOf('validarChequesLoteContrato.js') < restart);
assert(script.lastIndexOf('configurarSessao12hDev.js --verificar') > restart);
assert.equal((script.match(/pm2 restart backend-dev/g) || []).length, 1);
assert(script.match(/test "\$env_hash_dev"/g).length >= 3);
for (const trecho of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev',
  'test "$(git branch --show-current)" = refactor/frontend',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor 1393a446',
  'git diff --quiet 1393a446', 'backend/migrations', 'backend/package-lock.json',
  'frontend/package-lock.json', 'http://127.0.0.1:8001/health']) assert(script.includes(trecho), trecho);
assert(!/--aplicar|--update-env|backend-solicitacoes|pm2 (?:restart|reload) all|\bssh\b|npm run migrate|ALLOW_SCHEMA_MIGRATIONS=true/.test(script));
console.log('Deploy datas cheques DEV: SHA/base, guardas existentes antes do merge, PM2/watch, .env por hash, schema sem DDL e restart exclusivo aprovados. Sem EC2/banco/rede.');
