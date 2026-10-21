#!/usr/bin/env bash
set -euo pipefail
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
base_prod=60f327d7d7dc7f68d8e2eb8b3e232d6d649edc85
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer
env_hash_prod="$(sha256sum backend/.env)"
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'
  || p.status !== 'online' || (p.PORT !== undefined && Number(p.PORT) !== 8000)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 PRODUCAO/porta/watch diverge. Nada atualizado.');
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica deve permanecer desabilitada.');
NODE
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor "$base_prod" HEAD
git merge-base --is-ancestor "$base_prod" "$versao_prod"
git merge-base --is-ancestor HEAD "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations \
  backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git diff --quiet "$base_prod" "$versao_prod" -- backend/src \
  ':(exclude)backend/src/services/pagamentoAutorizacaoSelecaoService.js' \
  ':(exclude)backend/src/services/pagamentoAutorizacaoService.js' \
  ':(exclude)backend/src/services/pagamentoManualFilaService.js' \
  ':(exclude)backend/src/controllers/PagamentoAutorizacaoController.js' \
  ':(exclude)backend/src/routes.js'
# Verificadores JA instalados: identidade, TLS, schema, flags e sessao12h.
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployAutorizacaoUnicaProducao.js
node --check src/services/pagamentoAutorizacaoSelecaoService.js
node --check src/services/pagamentoAutorizacaoService.js
node --check src/services/pagamentoManualFilaService.js
node --check src/controllers/PagamentoAutorizacaoController.js
node --check src/routes.js
# Servicos reais com persistencia/WebAuthn/Redis em memoria. Sem envio real.
timeout 120s node scripts/validarAutorizacaoSelecao.js
timeout 120s node scripts/validarFilaDiretaProprietario.js
timeout 120s node scripts/validarBloqueioProprietario.js
timeout 120s node scripts/validarPainelAutorizacoes.js
timeout 120s node scripts/validarTitulosExcluidosAutorizacao.js
timeout 120s node scripts/validarReenvioAutorizacaoPush.js
timeout 120s node scripts/validarCartaoParcelamentoBaixa.js
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'PRODUCAO atualizada: uma passkey para toda a selecao. Sem migration/dependencias/.env/flags ou operacao financeira automatica. DEV nao alterado.'
