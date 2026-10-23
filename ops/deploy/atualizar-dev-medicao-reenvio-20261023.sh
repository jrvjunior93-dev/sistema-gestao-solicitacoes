#!/usr/bin/env bash
# Exclusivo DEV: reenvio apos rejeicao. Migration002 pode bloquear escritas.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
test "${CONFIRM_DEV_BACKUP:-}" = SIM || { echo 'Confira o backup DEV e confirme CONFIRM_DEV_BACKUP=SIM.' >&2; exit 1; }
base_dev=be3036675973c9e6e748daa6add5e1be27aaba98
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
cd ..
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/package-lock.json frontend/package-lock.json
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
for (const arquivo of ['backend/package.json', 'frontend/package.json']) {
  const manifesto = ref => {
    const { scripts, ...resto } = JSON.parse(cp.execFileSync('git', ['show', `${ref}:${arquivo}`], { encoding: 'utf8' })); return resto;
  };
  assert.deepEqual(manifesto(base), manifesto(versao), 'Dependencias/runtime divergentes.');
}
const migrations = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/migrations'], { encoding: 'utf8' }).trim();
assert.equal(migrations, 'A\tbackend/migrations/202610230002_medicao_vinculos_ativos.js', 'Migration inesperada.');
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/src', 'frontend/src'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.deepEqual(arquivos, [
  'M\tbackend/src/controllers/SolicitacaoController.js',
  'A\tbackend/src/services/medicaoRegistroErroService.js'
], 'Runtime fora da correcao autorizada.');
NODE
# Em retomada no mesmo SHA, a verificacao dedicada aceita somente002 pendente.
# No checkout anterior, exigir schema/sessao anteriores completos antes do FF.
if test "$(git rev-parse HEAD)" = "$versao_dev"; then
  (cd backend && timeout 45s node scripts/aplicarMigrationMedicaoReenvioDev.js --verificar)
else
  (cd backend && timeout 45s node scripts/configurarSessao12hDev.js --verificar)
fi
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node --check src/controllers/SolicitacaoController.js
node --check src/services/medicaoRegistroErroService.js
# QAs isolados; SQLite real executado no Node24 local, sem dependencia no host.
timeout 120s node scripts/validarDeployMedicaoReenvioDev.js
timeout 120s node scripts/validarMedicaoVinculoSchema.js --sem-sqlite
for teste in validarMedicaoRejeicaoFavorecido.js validarMedicaoValorPagamento.js \
  validarMedicaoRecargaFluxoPagamento.js validarContratoSaldoReprogramacao.js validarMedicaoFavorecidos.js \
  validarContratoMedicaoEncerramento.js validarGestaoContratosOperacional.js validarAprovacaoExclusivaContrato.js \
  validarRetornoContratoAprovadoObra.js validarFilaDestinatarios.js validarTituloDadosPagamento.js \
  validarPagamentosEngine.js validarAutorizacaoProprietarioPagamentos.js validarPermissoesFinanceiroRota.js; do
  timeout 120s node "scripts/$teste"
done
timeout 45s node scripts/aplicarMigrationMedicaoReenvioDev.js --verificar
# Janela DEV/backup confirmados. Nao habilitar DDL automaticamente no PM2/.env.
timeout 300s node scripts/aplicarMigrationMedicaoReenvioDev.js --aplicar
timeout 45s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
timeout 45s node scripts/aplicarMigrationMedicaoReenvioDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado. Homologue reenvio da mesma parcela e bloqueio de duplicidade. Nenhuma acao em producao.'
