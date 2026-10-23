#!/usr/bin/env bash
# Exclusivo DEV: sem migrations, dependencias, flags ou operacoes financeiras.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=c44b1adda96a76c544ca51d8669726a8fd8dc7d1
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica deve permanecer desabilitada.');
NODE
cd backend
node <<'NODE'
require('./src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica habilitada. Nada atualizado.');
NODE
# Leitura apenas: confere UUID/host/porta/PM2/flags/sessao e nenhuma pendencia.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json backend/migrations
# Os motores financeiros e as permissoes nao fazem parte deste ajuste de leitura.
git diff --quiet "$base_dev" "$versao_dev" -- backend/src/services/cartaoRecargaSaldoService.js backend/src/services/recargaCartaoService.js backend/src/services/authorizationService.js backend/src/services/solicitacaoRetornoService.js frontend/src/components/recarga-cartao/PrestacaoRecargaCartao.jsx
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployRecargaSaldoDev.js
node --check src/services/recargaCartaoSaldoLeituraService.js
node --check src/controllers/RecargaCartaoController.js
# QAs isolados, sem criar ou alterar solicitacoes, saldos ou pagamentos reais.
for teste in validarRecargaSaldoOrigens.js validarRecargasMultiplosCartoes.js \
  validarRecargaRegularizacao.js validarMedicaoRecargaFluxoPagamento.js \
  validarSegurancaAcessoDireto.js validarAcessoAnexosSolicitacoes.js \
  validarSaldoCartaoSchemaLimiteDp.js; do
  timeout 120s node "scripts/$teste"
done
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Preserva o ambiente existente do PM2; nao propaga autorizacao de DDL.
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado. Homologue rotulos, origem e aviso do saldo da recarga. Nenhuma acao em producao.'
