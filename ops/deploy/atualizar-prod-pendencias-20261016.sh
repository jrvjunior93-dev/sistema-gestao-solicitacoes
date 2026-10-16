#!/usr/bin/env bash
# Somente PRODUCAO; executar apos homologacao DEV e backup cifrado/timer conferidos.
# Recebe SHA imutavel aprovado. Nao faz fetch/merge nem reinicia o DEV.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
test "$#" -eq 1
[[ "$1" =~ ^[a-f0-9]{40}$ ]]
test "$(git rev-parse HEAD)" = "$1"
git merge-base --is-ancestor 7e1015abf376afddde8d62b1e590271746881355 HEAD
git merge-base --is-ancestor fb9a0e89e944017dcaacafdefed4f66a88c87e34 HEAD
exec 9>.git/fluxy-prod-deploy.lock
flock -n 9
systemctl is-active --quiet fluxy-prod-db-backup.timer
test "${PROD_RELEASE_BACKUP_CONFIRMED:-}" = true
test "${PROD_RELEASE_TIMER_CONFIRMED:-}" = true
test "${PROD_RELEASE_TLS_CONFIRMED:-}" = true
cd backend
npm ci --omit=dev
npm run test:release-producao-20261016
npm run test:tls-producao-20261016
npm run test:medicao-valor-pagamento
npm run test:titulos-compartilhados
npm run test:contrato-medicao-marcacao
npm run test:performance-fila-dp
npm run test:sessao-12h
npm run test:rh-movimentacoes-documentais
node scripts/validarFilaComprovantePendente.js
node scripts/validarCartaoOpcionalSolicitacao.js
node scripts/validarSegurancaAcessoDireto.js
node scripts/validarDeployFilaDpProducao.js
node ../frontend/scripts/validarJanelaFila.mjs

# Conexao isolada TLS/identidade e backup antes de persistir somente a CA.
timeout 60s node scripts/configurarTlsProducao20261016.js --aplicar "$1"
ca_prod=/home/ubuntu/sistema-gestao-solicitacoes-main/.git/fluxy-rds-global-bundle.pem
DB_SSL_CA_FILE="$ca_prod" timeout 40s node scripts/releaseProducao20261016.js --preflight "$1"
# Apenas as tres migrations homologadas; flags temporarias restauradas no helper.
DB_SSL_CA_FILE="$ca_prod" node scripts/releaseProducao20261016.js --aplicar-migrations "$1"
# Backup privado do .env e mudanca exclusiva de JWT_EXPIRES_IN para 12h.
DB_SSL_CA_FILE="$ca_prod" node scripts/releaseProducao20261016.js --sessao-12h "$1"
DB_SSL_CA_FILE="$ca_prod" JWT_EXPIRES_IN=12h pm2 restart backend-solicitacoes --update-env

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const r = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) { console.log('Health PRODUCAO: HTTP ' + r.status); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Health de producao nao respondeu. Consulte pm2 logs backend-solicitacoes --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE
DB_SSL_CA_FILE="$ca_prod" JWT_EXPIRES_IN=12h timeout 40s node scripts/releaseProducao20261016.js --verificar "$1"
git log -1 --oneline
printf '\nProducao atualizada; DEV preservado. Faca novo login para sessao de 12h.\n'
