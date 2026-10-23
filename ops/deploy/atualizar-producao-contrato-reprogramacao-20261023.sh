#!/usr/bin/env bash
# Exclusivo PRODUCAO; correcao homologada no DEV, sem DDL/operacao financeira.
set -euo pipefail
trap 'echo "Atualizacao PRODUCAO interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as guardas." >&2' ERR
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
base_prod=8982855e006a332861aa3288abe1c3ccc6a5e631
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica deve permanecer desabilitada.');
require('node:sqlite');
NODE
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor "$base_prod" HEAD
git merge-base --is-ancestor HEAD "$versao_prod"
git merge-base --is-ancestor fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662 "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/package.json frontend/package.json backend/package-lock.json frontend/package-lock.json backend/migrations backend/scripts/promoverSchemaProducao20261018.js
# Somente dois runtimes homologados, sem remover arquivos exclusivos MAIN.
node - "$base_prod" "$versao_prod" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, alvo] = process.argv.slice(2);
const git = args => cp.execFileSync('git', args, { encoding: 'utf8' });
assert.deepEqual(git(['diff', '--name-status', base, alvo, '--', 'backend/src', 'frontend/src']).trim().split(/\r?\n/), [
  'M\tbackend/src/services/contratoSaldoReprogramacaoService.js',
  'M\tfrontend/src/components/contratos/ReprogramarSaldoContrato.jsx'
], 'Runtime fora do ajuste homologado. Pare para revisar.');
git(['diff', '--exit-code', 'fee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662', alvo, '--', 'backend/src', 'frontend/src']);
assert.equal(git(['diff', '--name-only', '--diff-filter=D', base, alvo]).trim(), '', 'Exclusividades MAIN removidas.');
NODE
cd backend
# Somente leitura; exige schema previamente atualizado, identidade/TLS/12h/flags.
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployContratoReprogramacaoProducao.js
node --check src/services/contratoSaldoReprogramacaoService.js
# Testes isolados, sem contratos/titulos/historicos reais alterados.
for teste in validarContratoSaldoReprogramacao.js validarContratoMedicaoEncerramento.js \
  validarGestaoContratosOperacional.js validarContratoAditivoVigencia.js \
  validarContratoAditivoNegociacao.js validarAprovacaoExclusivaContrato.js \
  validarRetornoContratoAprovadoObra.js validarMedicaoFavorecidos.js \
  validarMedicaoValorPagamento.js validarMedicaoRecargaFluxoPagamento.js \
  validarSegurancaAcessoDireto.js; do
  timeout 120s node "scripts/$teste"
done
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
cd ..
test "$env_hash_prod" = "$(sha256sum backend/.env)"
systemctl is-active --quiet fluxy-prod-db-backup.timer
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
echo 'PRODUCAO atualizada: reprogramacao parcial e digitacao do valor. Sem migration, baixa ou reprogramacao real no deploy; DEV preservado.'
