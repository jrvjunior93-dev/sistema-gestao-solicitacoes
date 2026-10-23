#!/usr/bin/env bash
# Exclusivo DEV: frontend na Vercel; EC2 recebe somente o fast-forward.
set -euo pipefail
trap 'echo "Atualizacao DEV interrompida na linha $LINENO. Nao contorne as protecoes; envie a saida sem segredos." >&2' ERR
versao_dev="${1:?Informe o SHA completo publicado na refactor/frontend}"
[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA DEV invalido.' >&2; exit 1; }
base_dev=ae9df9d36a0ab81dd3fb8126a24801deefe5d393
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
exec 9>"$(git rev-parse --git-path fluxy-dev-deploy.lock)"
flock -n 9
env_hash_dev="$(sha256sum backend/.env)"
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
  'A\tdocs/handoffs/2026-10-23-fila-filtros-arranjo.md',
  'M\tdocs/modulos/financeiro/README.md',
  'M\tdocs/workspace/OWNERSHIP_ATIVO.md',
  'M\tfrontend/package.json',
  'A\tfrontend/scripts/filaFiltrosArranjoQA.mjs',
  'A\tfrontend/scripts/validarDeployFilaFiltrosArranjoDev.mjs',
  'M\tfrontend/scripts/validarFilaInstrumentosUI.mjs',
  'A\tfrontend/scripts/validarFiltrosOrdenaveis.mjs',
  'M\tfrontend/src/components/financeiro/FiltrosFilaPagamentos.jsx',
  'M\tfrontend/src/components/padrao/PainelFiltrosVisiveis.jsx',
  'M\tfrontend/src/components/ui/ApropriacaoAutocomplete.jsx',
  'A\tops/deploy/atualizar-dev-fila-filtros-arranjo-20261023.sh'
], 'Inventario diferente do complemento dos filtros. Nada atualizado.');
const manifesto = ref => JSON.parse(cp.execFileSync('git', ['show', `${ref}:frontend/package.json`], { encoding: 'utf8' }));
const antes = manifesto(base), depois = manifesto(versao);
assert.equal(antes.scripts['test:fila-filtros-arranjo'], undefined);
assert.equal(depois.scripts['test:fila-filtros-arranjo'], 'node scripts/validarFiltrosOrdenaveis.mjs && node scripts/validarFilaInstrumentosUI.mjs --filtros-arranjo');
delete depois.scripts['test:fila-filtros-arranjo'];
assert.deepEqual(depois, antes, 'Manifesto/dependencias fora do ajuste QA.');
NODE
git merge --ff-only "$versao_dev"
test "$(git rev-parse HEAD)" = "$versao_dev"
test "$env_hash_dev" = "$(sha256sum backend/.env)"
# Testes puros, sem dependencias frontend/browser ou acesso a API/banco.
timeout 45s node frontend/scripts/validarDeployFilaFiltrosArranjoDev.mjs
timeout 45s node frontend/scripts/validarFiltrosOrdenaveis.mjs
git log -1 --oneline
echo 'Checkout DEV atualizado. Nenhuma migration, instalacao, mudanca de .env ou reinicio de processo.'
echo 'Interface: aguarde a publicacao Vercel DEV deste commit e atualize a pagina.'
