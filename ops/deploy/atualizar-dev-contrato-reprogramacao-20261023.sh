#!/usr/bin/env bash
# Exclusivo DEV: sem migration, instalacao ou operacao financeira real.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=d64137c7c30451576d4456bd8ae271e8604909a2
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
# Preflight de leitura: ambiente/UUID/banco/PM2/flags/schema/sessao existentes.
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package.json frontend/package.json backend/package-lock.json frontend/package-lock.json backend/migrations
# Inventario antes do checkout: apenas os dois runtimes desta correcao.
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/src', 'frontend/src'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.deepEqual(arquivos, [
  'M\tbackend/src/services/contratoSaldoReprogramacaoService.js',
  'M\tfrontend/src/components/contratos/ReprogramarSaldoContrato.jsx'
], 'Runtime fora do ajuste autorizado. Pare para revisar.');
NODE
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployContratoReprogramacaoDev.js
node --check src/services/contratoSaldoReprogramacaoService.js
# QAs isolados; nenhum contrato, titulo ou historico real e alterado.
for teste in validarContratoSaldoReprogramacao.js validarContratoMedicaoEncerramento.js \
  validarGestaoContratosOperacional.js validarContratoAditivoVigencia.js \
  validarContratoAditivoNegociacao.js validarAprovacaoExclusivaContrato.js \
  validarRetornoContratoAprovadoObra.js validarMedicaoFavorecidos.js \
  validarMedicaoValorPagamento.js validarMedicaoRecargaFluxoPagamento.js \
  validarSegurancaAcessoDireto.js; do
  timeout 120s node "scripts/$teste"
done
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Preservar ambiente PM2; nao propagar permissao DDL do terminal.
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
echo 'DEV atualizado. Teste saldo parcial, sobra, nova programacao e digitacao do valor. Nenhuma acao em producao.'
