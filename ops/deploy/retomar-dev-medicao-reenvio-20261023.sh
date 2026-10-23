#!/usr/bin/env bash
# Retomada exclusiva DEV: migration002 JA aplicada. Nenhuma migration executada.
set -euo pipefail
trap 'echo "Retomada DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=41bec992a463fb914302628a28fa9deec11d6084
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
require('./backend/src/config/env');
if (/^(true|1|yes|on)$/i.test(String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim())) throw Error('Migration automatica habilitada. Nada atualizado.');
NODE

git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" "$versao_dev"
head_dev="$(git rev-parse HEAD)"
test "$head_dev" = "$base_dev" || test "$head_dev" = "$versao_dev"
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.deepEqual(arquivos, [
  'M\tbackend/scripts/aplicarMigrationMedicaoReenvioDev.js',
  'M\tbackend/scripts/validarDeployMedicaoReenvioDev.js',
  'A\tbackend/scripts/validarMedicaoVerificadorMetadata.js',
  'A\tdocs/handoffs/2026-10-23-medicao-verificador-retomada.md',
  'M\tdocs/workspace/OWNERSHIP_ATIVO.md',
  'A\tops/deploy/retomar-dev-medicao-reenvio-20261023.sh'
], 'Inventario diferente da retomada autorizada. Nada atualizado.');
NODE
# Verificador anterior de sessao/schema e somente leitura; nao tem o falso
# negativo das expressoes geradas. Valida DEV/UUID/PM2/flags antes do FF.
(cd backend && timeout 45s node scripts/configurarSessao12hDev.js --verificar)
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node --check scripts/aplicarMigrationMedicaoReenvioDev.js
timeout 120s node scripts/validarDeployMedicaoReenvioDev.js
timeout 120s node scripts/validarMedicaoVerificadorMetadata.js
timeout 120s node scripts/validarMedicaoVinculoSchema.js --sem-sqlite
timeout 120s node scripts/validarMedicaoRejeicaoFavorecido.js
# Modo estritamente de leitura: exige registro002, nenhuma pendencia,
# schema completo e ausencia de duplicidades. Nao chama runMigrations.
timeout 45s node scripts/aplicarMigrationMedicaoReenvioDev.js --verificar-aplicada
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
cd backend
timeout 45s node scripts/configurarSessao12hDev.js --verificar
timeout 45s node scripts/aplicarMigrationMedicaoReenvioDev.js --verificar-aplicada
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'Retomada DEV concluida. Nenhuma migration executada; somente backend-dev reiniciado.'
