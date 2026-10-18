#!/usr/bin/env bash
# Exclusivo PRODUCAO. Duas migrations estruturais; sem seeds ou backfills.
# Backup recente conferido e homologacao dev confirmados pelo proprietario.
set -euo pipefail
cd /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=no)"
git merge-base --is-ancestor 8ecde6ff73e160e245b9c128e67ac8659d3ea8e1 HEAD
git merge-base --is-ancestor 10c583645037695ff3e8d8ea327497d9b24f6190 HEAD

exec 9>.git/fluxy-prod-pendencias-deploy.lock
flock -n 9 || { printf 'Outro deploy desta promocao esta em andamento.\n' >&2; exit 1; }

cd backend
npm ci --omit=dev
node --check src/routes.js
node --check src/services/compraDiretaFreteFinanceiroService.js
node --check src/services/recargaCartaoRegularizacaoService.js
node --check src/services/rhPagamentoSolicitacaoService.js
node --check migrations/202610150001_cartoes_recarga_saldo.js
node --check migrations/202610150002_comprovante_compartilhado_fila.js
node scripts/validarCompraDiretaGestao.js
node scripts/validarCompraDiretaFreteFinanceiro.js
node scripts/validarRecargasMultiplosCartoes.js
node scripts/validarRecargaRegularizacao.js
node scripts/validarSaldoCartaoSchemaLimiteDp.js
node scripts/validarRhPagamentoSolicitacao.js
node scripts/validarRhPagamentoEnvioParcial.js
node scripts/validarFilaComprovantePendente.js
node scripts/validarComprovanteCompartilhadoSchema.js
node scripts/validarComprovantesPdfFila.js
node scripts/validarFilaPagamentosManuais.js
node scripts/validarSegurancaAcessoDireto.js
node scripts/validarDeployPendenciasProducao.js

node <<'NODE'
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { env, validateRequiredEnv } = require('./src/config/env');
const db = require('./src/database');
const { assertMigrationsUpToDate, getMigrationState, runMigrations } = require('./src/database/runMigrations');
(async () => {
  validateRequiredEnv();
  if (env.deploymentEnvironment !== 'production') throw new Error('Ambiente diferente de production. Pare e confira.');
  if (env.devUserSwitchEnabled !== false) throw new Error('Troca exclusiva de DEV deve permanecer desabilitada em producao.');
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
  // Defaults ausente/false equivalentes, sem sobrescrever flags ou credenciais.
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
  const permitidas = ['202610150001_cartoes_recarga_saldo.js', '202610150002_comprovante_compartilhado_fila.js'];
  const state = await getMigrationState();
  if (!state.tableExists || state.pending.some(nome => !permitidas.includes(nome))) {
    throw new Error('Migrations adicionais ou controle ausente. Pare para revisao: ' + state.pending.join(', '));
  }
  console.log('Migrations pendentes autorizadas:', state.pending);
  if (state.pending.length) {
    const anterior = process.env.ALLOW_SCHEMA_MIGRATIONS;
    try {
      process.env.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete process.env.ALLOW_SCHEMA_MIGRATIONS;
      else process.env.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  } else console.log('As duas migrations ja estao aplicadas; nenhuma repetida.');
  await assertMigrationsUpToDate();
  console.log('PRODUCAO: processo/porta 8000/banco/flags/schema conferidos. Sem seeds/backfills.');
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
