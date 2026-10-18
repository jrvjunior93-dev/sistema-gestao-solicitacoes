#!/usr/bin/env bash
# Operador: somente PRODUCAO. Sem migrations e sem mudar flags/.env.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 6af7b1926e44de17eec1b2450b583968aa3d5a7d HEAD
git merge-base --is-ancestor b9ef16e4474833cb7f95ab285caf3708faf5a468 HEAD

cd backend
npm ci --omit=dev
node --check src/services/rhPagamentoSolicitacaoService.js
node scripts/validarRhPagamentoSolicitacao.js
node scripts/validarRhPagamentoEnvioParcial.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { assertMigrationsUpToDate } = require('./src/database/runMigrations');
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'production') throw new Error('Ambiente nao indica producao. Pare e confira.');
  const processo = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'backend-solicitacoes');
  if (!processo || !path.resolve(processo.pm2_env?.pm_exec_path || '').startsWith('/home/ubuntu/sistema-gestao-solicitacoes-main/backend/')) {
    throw new Error('backend-solicitacoes nao aponta para o checkout main.');
  }
  const pmEnv = processo.pm2_env;
  if (Number(pmEnv.PORT || env.port) !== 8000 || Number(env.port) !== 8000) throw new Error('Porta de producao diferente de 8000.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (pmEnv[key] !== undefined && String(pmEnv[key]) !== String(process.env[key] ?? '')) {
      throw new Error(`Variavel ${key} diverge entre PM2 e terminal/.env. Confira sem compartilhar segredos.`);
    }
  }
  // Mesmo parser booleano/default false de config/env: AUSENTE e false sao
  // equivalentes. Divergencia funcional continua bloqueada, sem alterar flags.
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
  console.log('PRODUCAO: processo, porta, banco, flags e schema conferidos. Nenhuma migration aplicada.');
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
printf '\nProducao atualizada. Nenhum processo de desenvolvimento reiniciado.\n'
