'use strict';
// Inspecao local do roteiro; nao carrega env nem acessa servicos externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.resolve(__dirname,'../../ops/deploy/atualizar-producao-pwa-historico-20261018.sh'),'utf8');
for (const texto of ['set -euo pipefail','CONFIRM_PROD_BACKUP:-','CONFIRM_PROD_BACKUP_TIMER:-',
  'fluxy-prod-deploy.lock','systemctl is-active --quiet fluxy-prod-db-backup.timer',
  'git branch --show-current)" = main','git status --porcelain --untracked-files=no',
  'git merge-base --is-ancestor HEAD','git merge --ff-only',
  'git diff --quiet 2e1466295fa10ae521f8c75fb911366ebf03d59b',
  'frontend backend/src backend/server.js backend/migrations backend/package-lock.json',
  'scripts/validarFilaRemetente.js','scripts/validarTitulosExcluidosAutorizacao.js',
  'sha256sum backend/.env','http://127.0.0.1:8000/health']) assert(shell.includes(texto),texto);
assert(shell.indexOf('p.watch')<shell.indexOf('git merge --ff-only'));
const preflight = 'scripts/verificarPwaPeriodoProducao.js --verificar';
assert.equal(shell.split(preflight).length-1,3,'Preflight antes/depois do merge e apos restart');
assert(shell.indexOf(preflight)<shell.indexOf('git merge --ff-only'));
assert(shell.lastIndexOf(preflight)>shell.indexOf('pm2 restart backend-solicitacoes'));
assert.deepEqual(shell.match(/^\s*pm2\s+.+$/gm).map(s=>s.trim()),['pm2 restart backend-solicitacoes']);
assert(!/--update-env|\bssh\b|npm run migrate|--aplicar\b|ALLOW_SCHEMA_MIGRATIONS=true|\b(?:sed|tee)\b/.test(shell));
assert(!/pm2\s+(?:restart|reload|delete|stop|save)\s+(?:all|backend-dev)/.test(shell));
assert(shell.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
console.log('Roteiro PRODUCAO historico: backup/timer, caminho/branch/SHA/ff-only/lock/watch, codigo homologado, preflight somente leitura, hash .env, restart exclusivo e nenhum DDL/restore/DEV aprovados. Sem rede/banco.');
