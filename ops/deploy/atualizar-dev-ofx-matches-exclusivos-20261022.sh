#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as protecoes." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=bc2c69ed84259e7e97914180b37b7855ec2eb1ab
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
# Exige a base DEV ja atualizada; se ainda anterior, pare para conferir o pacote anterior.
git merge-base --is-ancestor "$base_dev" HEAD
git merge-base --is-ancestor HEAD "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/migrations backend/package-lock.json frontend/package-lock.json
git show "$versao_dev:backend/scripts/validarDeployOfxMatchesDev.js" |
  node - --pacotes "$base_dev" "$versao_dev"
git diff --quiet "$base_dev" "$versao_dev" -- backend/src \
  ':(exclude)backend/src/services/conciliacaoBancariaService.js' \
  ':(exclude)backend/src/services/conciliacaoGruposMatch.js'
git diff --quiet "$base_dev" "$versao_dev" -- frontend/src \
  ':(exclude)frontend/src/pages/FinanceiroConciliacao.jsx' \
  ':(exclude)frontend/src/utils/conciliacaoAlocacao.js'
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployOfxMatchesDev.js
node --check src/services/conciliacaoBancariaService.js
node --check src/services/conciliacaoGruposMatch.js
# QAs isolados/memoria: nao importam OFX nem criam/alteram conciliacoes financeiras reais.
for teste in validarOfxMatchesExclusivos.js validarConciliacaoMatchesExatos.js \
  validarConciliacaoRendimentos.js validarCarteiraChequesBaixaComposta.js \
  validarOfxObrasFinanceiro.js; do
  timeout 120s node "scripts/$teste"
done
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
echo 'DEV atualizado: OFX com movimentos exclusivos e codigo TIT. Sem DDL/dependencias/.env/flags/memoria ou operacao financeira real. Homologue no frontend DEV.'
