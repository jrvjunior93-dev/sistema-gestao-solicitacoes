#!/usr/bin/env bash
set -euo pipefail

versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA de producao invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer

# Conferir antes de substituir arquivos: watch nao pode reiniciar o backend
# automaticamente enquanto o codigo novo ainda aguarda schema.
node <<'NODE'
const cp = require('node:child_process');
const ps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
const p = ps[0]?.pm2_env;
if (ps.length !== 1 || p?.pm_exec_path !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js'
  || (p.PORT !== undefined && Number(p.PORT) !== 8000) || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) {
  throw Error('PM2 PRODUCAO/porta/watch diverge; nenhum arquivo atualizado.');
}
NODE

git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor HEAD "$versao_prod"
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
cd backend
npm ci --omit=dev
node scripts/validarDeployProducao20261018.js
node scripts/validarOfxObrasFinanceiro.js
node scripts/validarRhAdmissaoDiaria.js
node scripts/validarBloqueioProprietario.js
node scripts/validarPainelAutorizacoes.js
timeout 45s node scripts/promoverSchemaProducao20261018.js --verificar
# DDL MySQL tem commit implicito. Em falha, parar; nao desfazer colunas nem
# restaurar banco/checkout automaticamente. O runner aceita retomada parcial.
timeout 180s node scripts/promoverSchemaProducao20261018.js --aplicar
timeout 45s node scripts/promoverSchemaProducao20261018.js --concluido

# Nenhuma configuracao mudou: preservar o ambiente PM2, sem --update-env,
# sem propagar flags temporarias e sem reiniciar o DEV ou outros processos.
env -u CONFIRM_PROD_BACKUP -u CONFIRM_PROD_BACKUP_TIMER -u ALLOW_SCHEMA_MIGRATIONS \
  pm2 restart backend-solicitacoes
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health PRODUCAO: HTTP %{http_code}\n' \
  http://127.0.0.1:8000/health
timeout 45s node scripts/promoverSchemaProducao20261018.js --concluido
git log -1 --oneline
echo 'PRODUCAO atualizada; .env/PILOT/TLS/sessao preservados. DEV nao alterado.'
