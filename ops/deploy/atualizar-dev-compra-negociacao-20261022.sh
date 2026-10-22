#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
test "${CONFIRM_DEV_BACKUP:-}" = SIM || { echo 'Confira backup recente DEV e execute com CONFIRM_DEV_BACKUP=SIM.' >&2; exit 1; }
base_dev=41219c3af7846006c3b8575d842ebdd76dbd1804
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-dev-deploy.lock)"
flock -n 9
env_hash_dev="$(sha256sum backend/.env)"
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js'
  || p.status !== 'online' || (p.PORT !== undefined && Number(p.PORT) !== 8001)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 DEV/porta/watch diverge. Nada atualizado.');
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica deve permanecer desabilitada.');
NODE
cd backend
node <<'NODE'
require('./src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica habilitada. Nada atualizado.');
NODE
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
# Somente a migration nova; sem atualizar dependencias ou outras estruturas.
git diff --quiet "$base_dev" "$versao_dev" -- backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git diff --quiet "$base_dev" "$versao_dev" -- backend/migrations ':(exclude)backend/migrations/202610220001_titulo_negociacao_pagamento.js'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployCompraNegociacaoDev.js
# QAs isolados: nao criam solicitacoes, titulos ou pagamentos reais.
for teste in validarCompraDiretaCredorObrigatorio.js validarCompraDiretaGestao.js \
  validarCompraDiretaFreteFinanceiro.js validarTituloNegociacaoPagamento.js \
  validarTituloRenegociacaoService.js validarTituloRenegociacaoDomain.js \
  validarTituloRenegociacaoVinculos.js validarTituloRenegociacaoSincronizacao.js \
  validarFilaBaixaComposta.js validarAnaliseProprietario.js; do
  timeout 120s node "scripts/$teste"
done
timeout 45s node scripts/aplicarMigrationNegociacaoPagamentoDev.js --verificar
timeout 120s node scripts/aplicarMigrationNegociacaoPagamentoDev.js --aplicar
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Nao propaga a autorizacao temporaria nem altera flags/variaveis do PM2.
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/aplicarMigrationNegociacaoPagamentoDev.js --verificar
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado. Homologue Compra Direta e pagamento negociado no frontend DEV. Nenhuma acao em producao.'
