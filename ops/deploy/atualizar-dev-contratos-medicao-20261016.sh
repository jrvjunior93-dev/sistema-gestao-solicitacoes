#!/usr/bin/env bash
# Exclusivo DEV. Aplica apenas a migration estrutural 202610150003.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
test "$(git branch --show-current)" = refactor/frontend
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 67c985e61ff5418726099a13b574b99f55375588 HEAD
exec 9>.git/fluxy-dev-deploy.lock
flock -n 9 || { printf 'Outro deploy DEV esta em andamento.\n' >&2; exit 1; }

cd backend
npm ci --omit=dev
node --check src/routes.js
node --check migrations/202610150003_contrato_medicao_encerramento.js
npm run test:contrato-medicao-marcacao
npm run test:performance-fila-dp
node scripts/validarPedidoCompraFinanceiroGeo.js
node scripts/validarFilaComprovantePendente.js
node scripts/validarMedicaoRecargaFluxoPagamento.js
node scripts/validarDeployContratoMedicaoDev.js

# Identidade/PM2/schema conferidos antes de permitir qualquer DDL.
# A flag fica somente neste processo Node e e restaurada ao finalizar.
node scripts/aplicarMigrationContratoMedicaoDev.js
node scripts/configurarSessao12hDev.js --verificar
pm2 restart backend-dev --update-env
node scripts/configurarSessao12hDev.js --verificar

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('backend-dev saudavel na porta 8001.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Health DEV nao respondeu. Consulte pm2 logs backend-dev --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nDEV atualizado: contratos totalmente medidos, migration 202610150003. Nenhum processo de producao reiniciado.\n'
