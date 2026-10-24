#!/usr/bin/env bash
# Exclusivo DEV: uma tabela nova de recibos; sem backfill ou mudanca financeira.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
test "${CONFIRM_DEV_BACKUP:-}" = SIM || { echo 'Confira o backup DEV e confirme CONFIRM_DEV_BACKUP=SIM.' >&2; exit 1; }
base_dev=f598f25a46ef92ad85500dced976c384282d5b88
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
  || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PM2_DEV_DIFERENTE');
require('./backend/src/config/env');
for (const value of [p.ALLOW_SCHEMA_MIGRATIONS, process.env.ALLOW_SCHEMA_MIGRATIONS]) {
  if (/^(true|1|yes|on)$/i.test(String(value || '').trim())) throw Error('DDL_AUTOMATICO_HABILITADO');
}
NODE
git fetch origin refactor/frontend
git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
git merge-base --is-ancestor "$base_dev" "$versao_dev"
head_dev="$(git rev-parse HEAD)"
test "$head_dev" = "$base_dev" || test "$head_dev" = "$versao_dev"
node - "$base_dev" "$versao_dev" <<'NODE'
const cp = require('node:child_process'), assert = require('node:assert/strict');
const [base, versao] = process.argv.slice(2);
const mostrar = p => cp.execFileSync('git', ['show', `${versao}:${p}`], { encoding: 'utf8' });
const manifesto = JSON.parse(mostrar('ops/deploy/retirada-envios-dev-20261023.json'));
assert.equal(manifesto.base, base);
const arquivos = cp.execFileSync('git', ['diff', '--name-status', base, versao], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
assert.deepEqual(arquivos, [...manifesto.arquivos].sort(), 'Inventario diferente do ajuste autorizado.');
for (const p of ['backend/package.json', 'frontend/package.json']) {
  const antes = JSON.parse(cp.execFileSync('git', ['show', `${base}:${p}`], { encoding: 'utf8' }));
  const depois = JSON.parse(mostrar(p));
  assert.equal(antes.scripts['test:retirada-envios'], undefined);
  assert.equal(typeof depois.scripts['test:retirada-envios'], 'string');
  delete depois.scripts['test:retirada-envios'];
  assert.deepEqual(depois, antes, 'Dependencias/configuracao fora do ajuste QA.');
}
assert.equal(cp.execFileSync('git', ['diff', '--name-status', base, versao, '--', 'backend/migrations'], { encoding: 'utf8' }).trim(),
  'A\tbackend/migrations/202610230003_pagamento_envios_retiradas.js', 'Migration inesperada.');
NODE
# Preflight somente leitura antes do fast-forward. Retomada aceita003 pendente.
if test "$head_dev" = "$versao_dev"; then
  (cd backend && timeout 60s node scripts/aplicarMigrationRetiradaEnviosDev.js --verificar)
else
  (cd backend && timeout 60s node scripts/configurarSessao12hDev.js --verificar)
fi
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node --check src/services/pagamentoEnvioRetiradaService.js
node --check src/controllers/PagamentoEnvioRetiradaController.js
node --check migrations/202610230003_pagamento_envios_retiradas.js
timeout 120s node scripts/validarDeployRetiradaEnviosDev.js
for teste in validarAnaliseProprietario.js validarPainelAutorizacoes.js validarFilaPagamentosManuais.js validarPermissoesFinanceiroRota.js; do
  timeout 120s node "scripts/$teste"
done
if node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  timeout 120s node scripts/validarRetiradaEnvios.js
  timeout 120s node scripts/validarRetiradaEnviosHttp.js
  timeout 120s node scripts/validarPainelAutorizacoesSqlLocal.js
else
  echo 'QA SQLite exige Node24 e ja foi executado localmente. Host preservado; demais QAs isolados executados acima.'
fi
timeout 60s node scripts/aplicarMigrationRetiradaEnviosDev.js --verificar
# Flag de DDL somente neste subprocesso; nunca gravada no .env/PM2.
timeout 180s node scripts/aplicarMigrationRetiradaEnviosDev.js --aplicar
timeout 60s node scripts/configurarSessao12hDev.js --verificar
cd ..
test "$env_hash_dev" = "$(sha256sum backend/.env)"
env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev
curl --fail --show-error --silent --max-time 5 \
  --retry 20 --retry-delay 2 --retry-connrefused \
  --output /dev/null --write-out 'Health DEV: HTTP %{http_code}\n' \
  http://127.0.0.1:8001/health
(cd backend && timeout 60s node scripts/aplicarMigrationRetiradaEnviosDev.js --verificar-aplicada)
(cd backend && timeout 60s node scripts/configurarSessao12hDev.js --verificar)
test "$env_hash_dev" = "$(sha256sum backend/.env)"
git log -1 --oneline
echo 'DEV atualizado; migration003 conferida. Nenhuma acao em producao.'
echo 'Aguarde a Vercel DEV no mesmo commit; entre novamente para carregar as permissoes.'
