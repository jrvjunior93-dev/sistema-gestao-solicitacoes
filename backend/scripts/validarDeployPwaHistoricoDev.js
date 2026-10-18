'use strict';
// Teste local sem env, MySQL, Redis, PM2 ou rede reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { conferirExcluidos } = require('./verificarPainelAutorizacoesDev');
const resultado = data => ({ data, paginacao:{total:data.length} });
assert.deepEqual(conferirExcluidos(resultado([])),{total:0,amostra:0});
const item = {situacao_financeira:'EXCLUIDO',exclusao_titulo:{em:null},titulo:null};
const antes = JSON.stringify(item);
assert.equal(conferirExcluidos(resultado([item])).amostra,1);
assert.equal(JSON.stringify(item),antes);
for (const alterar of [
  {situacao_financeira:'AGUARDANDO'}, {exclusao_titulo:null}, {titulo:{status:'ABERTO'}},
  {origem_painel:'FILA_DIRETA',versao_painel:'nao-pode-decidir'},
  {origem_painel:'FILA_DIRETA',snapshot_hash:'nao-fabricar-assinatura'}
]) assert.throws(()=>conferirExcluidos(resultado([{...item,...alterar}])) ,/HISTORICO_EXCLUIDO_DIVERGENTE/);
const shell = fs.readFileSync(path.resolve(__dirname,'../../ops/deploy/atualizar-dev-pwa-historico-20261018.sh'),'utf8');
for(const texto of ['set -euo pipefail','flock -n 9','git merge --ff-only',
  'git status --porcelain --untracked-files=no','git merge-base --is-ancestor HEAD',
  'scripts/validarFilaRemetente.js','scripts/validarTitulosExcluidosAutorizacao.js',
  'scripts/verificarPainelAutorizacoesDev.js --verificar','http://127.0.0.1:8001/health']) assert(shell.includes(texto),texto);
assert(shell.indexOf('p.watch')<shell.indexOf('git merge --ff-only'));
assert(shell.indexOf('scripts/verificarRedisPasskeyDev.js --verificar')<shell.indexOf('git merge --ff-only'));
assert(shell.lastIndexOf('scripts/verificarPainelAutorizacoesDev.js --verificar')<shell.indexOf('pm2 restart backend-dev'));
assert.deepEqual(shell.match(/^pm2\s+.+$/gm),['pm2 restart backend-dev']);
assert(!/--update-env|npm run migrate|--aplicar\b|\bssh\b|backend-solicitacoes/.test(shell.replace('# Sem --update-env: conservar o ambiente atual do processo DEV.','')));
console.log('Deploy historico DEV: checkout/branch/SHA/lock/watch, preflight, sem migration/configuracao, somente restart DEV, historico excluido nao operacional e amostra vazia aprovados. Sem E/S externas.');
