#!/usr/bin/env bash
# Exclusivo PRODUCAO. Sem migrations, seeds/backfills ou mudanca de flags.
# Homologacao dev e backup cifrado/timer confirmados pelo proprietario.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 41e154f4c665ddd5bc1da88c384203de4d5c34ef HEAD
git merge-base --is-ancestor da9cf5696f0cff7ef9a8d7acf2480a3e1acbb851 HEAD
exec 9>.git/fluxy-prod-fila-dp-deploy.lock
flock -n 9 || { printf 'Outro deploy desta promocao esta em andamento.\n' >&2; exit 1; }

cd backend
npm ci --omit=dev
node --check src/routes.js
node --check src/controllers/RhRelatorioController.js
node --check src/services/pagamentoFilaFiltrosDomain.js
node --check src/services/rhTitulosEnviadosRelatorioService.js
node --check src/services/pagamentoManualFilaService.js
node --check src/services/rhPagamentoSolicitacaoService.js
node scripts/validarFilaFiltrosDp.js
node scripts/validarRhTitulosEnviadosRelatorio.js
node scripts/validarRhPagamentoSolicitacao.js
node scripts/validarRhPagamentoEnvioParcial.js
node scripts/validarFilaComprovantePendente.js
node scripts/validarFilaBaixaEstorno.js
node scripts/validarFilaPagamentosManuais.js
node scripts/validarSegurancaAcessoDireto.js
node scripts/validarDeployFilaDpProducao.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { assertMigrationsUpToDate } = require('./src/database/runMigrations');
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'production') throw new Error('Ambiente diferente de production. Pare e confira.');
  if (env.devUserSwitchEnabled !== false) throw new Error('Troca exclusiva de DEV deve permanecer desabilitada em producao.');
  if (env.paymentOwnerApprovalMode !== 'OFF') throw new Error('Esta promocao exige PAYMENT_OWNER_APPROVAL_MODE=OFF; nao alterar a flag para contornar.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-solicitacoes');
  const processo = processos[0];
  if (processos.length !== 1 || path.resolve(processo.pm2_env?.pm_exec_path || '') !== '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js') {
    throw new Error('backend-solicitacoes nao aponta exclusivamente para o checkout main.');
  }
  const pmEnv = processo.pm2_env;
  if (Number(pmEnv.PORT || env.port) !== 8000 || Number(env.port) !== 8000) throw new Error('Porta de producao diferente de 8000.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(process.env[key] ?? '')) {
      throw new Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
    }
  }
  // Preservar a troca autorizada de producao; AUSENTE/false sao equivalentes.
  for (const [key, carregado] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled], ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (pmEnv[key] !== undefined && ['1', 'true', 'yes', 'on'].includes(String(pmEnv[key]).trim().toLowerCase()) !== carregado) {
      throw new Error(`Flag ${key} diverge funcionalmente entre PM2 e configuracao carregada.`);
    }
  }
  if (pmEnv.PAYMENT_OWNER_APPROVAL_MODE !== undefined
    && String(pmEnv.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) {
    throw new Error('PAYMENT_OWNER_APPROVAL_MODE diverge entre PM2 e configuracao carregada.');
  }
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53'
    || rows[0]?.banco !== 'gestao_solicitacoes'
    || env.dbHost !== 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com') {
    throw new Error('Identidade do banco de PRODUCAO diferente da esperada.');
  }
  await assertMigrationsUpToDate();
  console.log('PRODUCAO: processo/porta 8000/banco/flags/schema conferidos. Nenhuma migration aplicada.');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
NODE

pm2 restart backend-solicitacoes --update-env

node <<'NODE'
(async () => {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      const response = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('backend-solicitacoes saudavel na porta 8000.'); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Health de producao nao respondeu. Consulte pm2 logs backend-solicitacoes --lines 60 --nostream.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
NODE

git log -1 --oneline
printf '\nProducao atualizada: filtros/recebimento e relatorio DP. Nenhum processo de desenvolvimento reiniciado.\n'
