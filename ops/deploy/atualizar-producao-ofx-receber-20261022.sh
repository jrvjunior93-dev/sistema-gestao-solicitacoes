#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Atualizacao PRODUCAO interrompida na linha $LINENO. Pare e envie a saida sem segredos; nao contorne as guardas." >&2' ERR
versao_prod="${1:?Informe o SHA completo publicado na main}"
[[ "$versao_prod" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA produtivo invalido.' >&2; exit 1; }
test "${CONFIRM_PROD_BACKUP:-}" = SIM
test "${CONFIRM_PROD_BACKUP_TIMER:-}" = SIM
base_prod=b6546229e3bbec9db2b01162ebfd21808a33481e
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
if (/^(true|1|yes|on)$/i.test(String(p.ALLOW_SCHEMA_MIGRATIONS || ''))) throw Error('Migration automatica deve permanecer desabilitada.');
require('node:sqlite');
NODE
git fetch origin main
git merge-base --is-ancestor "$versao_prod" origin/main
git merge-base --is-ancestor "$base_prod" HEAD
git merge-base --is-ancestor HEAD "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/migrations backend/package-lock.json frontend/package-lock.json
# Apenas dois novos comandos de QA por pacote; dependencias/scripts anteriores preservados.
git show "$versao_prod:backend/scripts/validarDeployOfxReceberProducao.js" |
  node - --pacotes "$base_prod" "$versao_prod"
git diff --quiet "$base_prod" "$versao_prod" -- backend/src \
  ':(exclude)backend/src/services/conciliacaoBancariaService.js' \
  ':(exclude)backend/src/services/conciliacaoGruposMatch.js' \
  ':(exclude)backend/src/services/tituloFinanceiroService.js' \
  ':(exclude)backend/src/services/tituloFormaPrevistaLeitura.js'
git diff --quiet "$base_prod" "$versao_prod" -- frontend/src \
  ':(exclude)frontend/src/pages/FinanceiroConciliacao.jsx' \
  ':(exclude)frontend/src/utils/conciliacaoAlocacao.js' \
  ':(exclude)frontend/src/pages/FinanceiroTitulos.jsx' \
  ':(exclude)frontend/src/utils/formaPagamentoTitulo.js'
# Verificadores previamente instalados. Identidade/TLS/schema/sessao/flags em leitura.
cd backend
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
cd ..
git merge --ff-only "$versao_prod"
test "$(git rev-parse HEAD)" = "$versao_prod"
test "$env_hash_prod" = "$(sha256sum backend/.env)"
cd backend
node scripts/validarDeployOfxReceberProducao.js
node --check src/services/conciliacaoBancariaService.js
node --check src/services/conciliacaoGruposMatch.js
node --check src/services/tituloFinanceiroService.js
node --check src/services/tituloFormaPrevistaLeitura.js
# QAs em memoria/offline: nao importa OFX, nao gera baixa e nao concilia dados reais.
for teste in validarOfxMatchesExclusivos.js validarConciliacaoMatchesExatos.js \
  validarConciliacaoRendimentos.js validarCarteiraChequesBaixaComposta.js \
  validarOfxObrasFinanceiro.js validarFormaPrevistaContratoReceber.js \
  validarRelatorioTitulosSelecao.js validarCartaoOpcionalSolicitacao.js \
  validarCartaoParcelamentoBaixa.js validarFilaBaixaComposta.js \
  validarRelatorioTitulosSolicitacao.js validarComercialTituloVencimento.js \
  validarComercialChequeQuitacao.js validarComercialContratosMultiunidadeImportacao.js; do
  timeout 120s node "scripts/$teste"
done
timeout 120s node scripts/verificarFinanceiroProducao20261019.js --verificar
timeout 60s node scripts/verificarReenvioAutorizacaoProducao.js --verificar
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
echo 'PRODUCAO atualizada: OFX com movimentos exclusivos/codigo TIT e forma prevista de contratos em Contas a Receber. DEV nao alterado; sem DDL/dependencias/.env/flags/memoria ou operacoes financeiras automaticas.'
