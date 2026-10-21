'use strict';
// QA estatico. Nao executa shell, banco, PM2, passkey ou rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-autorizacao-unica-20261021.sh'), 'utf8');
const merge = script.indexOf('git merge --ff-only'), restart = script.indexOf('pm2 restart backend-solicitacoes');
assert(merge > 0 && restart > merge);
for (const guarda of ['[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]]',
  'test "${CONFIRM_PROD_BACKUP:-}" = SIM', 'test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM',
  'base_prod=60f327d7d7dc7f68d8e2eb8b3e232d6d649edc85',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main',
  'test "$(git branch --show-current)" = main', 'test -z "$(git status --porcelain --untracked-files=no)"',
  'flock -n 9', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
  "p.status !== 'online'", 'p.watch', 'Number(p.PORT) !== 8000', 'p.ALLOW_SCHEMA_MIGRATIONS',
  'git merge-base --is-ancestor "$versao_prod" origin/main',
  'git merge-base --is-ancestor "$base_prod" HEAD', 'git merge-base --is-ancestor HEAD "$versao_prod"',
  'git merge-base --is-ancestor "$base_prod" "$versao_prod"',
  'git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations',
  'backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json',
  'git diff --quiet "$base_prod" "$versao_prod" -- backend/src']) {
  const i = script.indexOf(guarda);assert(i >= 0 && i < merge, guarda);
}
for (const arquivo of ['services/pagamentoAutorizacaoSelecaoService.js', 'services/pagamentoAutorizacaoService.js',
  'services/pagamentoManualFilaService.js', 'controllers/PagamentoAutorizacaoController.js', 'routes.js']) {
  const i = script.indexOf(`':(exclude)backend/src/${arquivo}'`);assert(i >= 0 && i < merge);
  const check = script.indexOf(`node --check src/${arquivo}`);assert(check > merge && check < restart);
}
for (const nome of ['verificarFinanceiroProducao20261019.js', 'verificarReenvioAutorizacaoProducao.js']) {
  assert(script.indexOf(`${nome} --verificar`) < merge);
  assert(script.lastIndexOf(`${nome} --verificar`) > restart);
  assert.equal(script.split(`${nome} --verificar`).length - 1, 3);
}
for (const nome of ['validarDeployAutorizacaoUnicaProducao.js', 'validarAutorizacaoSelecao.js',
  'validarFilaDiretaProprietario.js', 'validarBloqueioProprietario.js', 'validarPainelAutorizacoes.js',
  'validarTitulosExcluidosAutorizacao.js', 'validarReenvioAutorizacaoPush.js', 'validarCartaoParcelamentoBaixa.js']) {
  const i = script.indexOf(nome);assert(i > merge && i < restart, nome);
}
assert.equal((script.match(/git merge --ff-only/g) || []).length, 1);
assert.equal((script.match(/pm2 restart/g) || []).length, 1);
assert.equal((script.match(/test "\$env_hash_prod"/g) || []).length, 3);
assert(script.includes('http://127.0.0.1:8000/health'));
assert(script.includes('env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS'));
assert(!/--aplicar|--update-env|pm2 (?:reload|start|stop|delete)|\bssh\b|npm (?:ci|install|run migrate)|ALLOW_SCHEMA_MIGRATIONS=true|pm2 restart backend-dev|\bgit reset\b/.test(script));
console.log('OK deploy PROD autorizacao unica: SHA/ff-only/base/backup/timer, schema/TLS/UUID/sessao/flags readonly antes/depois, testes antes do restart exclusivo e .env preservado. Sem DDL/dependencias/envios reais.');
