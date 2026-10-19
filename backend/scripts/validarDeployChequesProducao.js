'use strict';
// Teste isolado: nao importa env/database nem executa comandos do roteiro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-cheques-20261019.sh'), 'utf8');
const merge = shell.indexOf('git merge --ff-only'), restart = shell.indexOf('pm2 restart backend-solicitacoes');
assert(merge > 0 && restart > merge);
for (const nome of ['verificarFinanceiroProducao20261019.js', 'verificarReenvioAutorizacaoProducao.js']) {
  assert(shell.indexOf(`${nome} --verificar`) < merge);
  assert(shell.indexOf(`${nome} --verificar`, merge) < restart);
  assert(shell.lastIndexOf(`${nome} --verificar`) > restart);
}
for (const nome of ['validarDatasCheques.js', 'validarFilaLiquidacaoRateada.js',
  'validarCarteiraChequesBaixaComposta.js', 'validarFilaBaixaComposta.js',
  'validarCartaoParcelamentoBaixa.js', 'validarBloqueioProprietario.js']) {
  assert(shell.indexOf(nome) > merge && shell.indexOf(nome) < restart);
}
for (const trecho of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]',
  'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main',
  'test "$(git branch --show-current)" = main',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'systemctl is-active --quiet fluxy-prod-db-backup.timer',
  'git merge-base --is-ancestor HEAD', 'git merge-base --is-ancestor 9e4faf4e',
  'git merge-base --is-ancestor e01e7bbf', 'git diff --quiet 9e4faf4e',
  'backend/migrations', 'backend/package-lock.json', 'frontend/package-lock.json',
  'env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS',
  'http://127.0.0.1:8000/health']) assert(shell.includes(trecho), trecho);
assert(shell.match(/test "\$env_hash_prod"/g).length >= 3);
assert.equal((shell.match(/pm2 restart backend-solicitacoes/g) || []).length, 1);
assert(!/--aplicar|--testar-push|--update-env|pm2 (?:restart|reload) (?:backend-dev|all)|\bssh\b|npm run migrate|ALLOW_SCHEMA_MIGRATIONS=true|simularRegularizacaoTitulos/.test(shell));
console.log('Deploy cheques PRODUCAO: SHA/base, backup/timer, bootstrap instalado antes do merge, schema sem DDL, .env/flags e restart exclusivo aprovados. Sem EC2/banco/rede.');
