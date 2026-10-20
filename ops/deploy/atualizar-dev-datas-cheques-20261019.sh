#!/usr/bin/env bash
set -euo pipefail
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
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
  || (p.PORT !== undefined && Number(p.PORT) !== 8001)
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2 DEV/porta/watch diverge. Nada atualizado.');
NODE
# Verificador JA instalado no DEV: nao importar scripts novos antes do merge.
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor HEAD "$versao_dev"
git merge-base --is-ancestor 1393a4460ca83db433da2de337f3180d880ccc9e HEAD
git diff --quiet 1393a4460ca83db433da2de337f3180d880ccc9e "$versao_dev" -- \
  backend/migrations backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
npm ci --omit=dev
node scripts/validarDeployDatasChequesDev.js
node scripts/validarEncerramentoSemPedidoHistorico.js
node scripts/validarUploadComprovantesFila.js
node scripts/validarFilaComprovantePendente.js
node scripts/validarComprovanteCompartilhadoSchema.js
node scripts/validarComprovantesPdfFila.js
node scripts/validarDatasCheques.js
node scripts/validarChequesLoteContrato.js
node scripts/validarFilaLiquidacaoRateada.js
node scripts/validarCarteiraChequesBaixaComposta.js
node scripts/validarFilaBaixaComposta.js
node scripts/validarCartaoParcelamentoBaixa.js
node scripts/validarBloqueioProprietario.js
# Sem DDL: qualquer migration pendente interrompe antes do restart.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado: motivo do encerramento sem pedido no historico, comprovantes manuais e cheques preservados. Sem migration/.env/flags alterados; producao nao alterada.'
