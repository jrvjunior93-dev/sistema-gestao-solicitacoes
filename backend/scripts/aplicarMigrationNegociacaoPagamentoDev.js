'use strict';
// Exclusivo DEV. Importacao pura para QA; CLI nao importa models nem faz backfill.
const { conferirAmbiente, BACKEND, UUID } = require('./verificarPermutasMySqlDev');
const MIGRATION = '202610220001_titulo_negociacao_pagamento.js';
const IDENTIDADE_SQL = 'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco';
const COLUNA_SQL = `SELECT DATA_TYPE AS tipo, IS_NULLABLE AS anulavel FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name IN ('titulos_financeiros','TitulosFinanceiros')
 AND column_name = 'pagamento_negociacao'`;

async function executar({ modo, cwd, env, runtimeEnv = process.env, validateRequiredEnv,
  db, schema, processos, log = console.log }) {
  if (!['--verificar', '--aplicar'].includes(modo)) throw Error('Use --verificar ou --aplicar exclusivamente no DEV.');
  validateRequiredEnv();
  conferirAmbiente({ modo: '--verificar', cwd, env, runtimeEnv, processos });
  const p = processos.find(p => p.name === 'backend-dev').pm2_env;
  if (p.status !== 'online') throw Error('PROCESSO_DEV_OFFLINE. Pare e confira antes de continuar.');
  for (const [key, atual] of [['DEV_USER_SWITCH_ENABLED', env.devUserSwitchEnabled],
    ['PRODUCTION_USER_SWITCH_ENABLED', env.productionUserSwitchEnabled]]) {
    if (p[key] !== undefined && /^(true|1|yes|on)$/i.test(String(p[key]).trim()) !== atual) throw Error(`Flag ${key} divergente. Nenhuma flag alterada.`);
  }
  if (p.PAYMENT_OWNER_APPROVAL_MODE !== undefined
    && String(p.PAYMENT_OWNER_APPROVAL_MODE || 'OFF').trim().toUpperCase() !== env.paymentOwnerApprovalMode) throw Error('PAYMENT_OWNER_APPROVAL_MODE divergente.');
  const [rows] = await db.query(IDENTIDADE_SQL);
  if (rows[0]?.uuid !== UUID || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE. Nenhuma migration aplicada.');
  const state = await schema.getMigrationState();
  if (!state.tableExists || state.pending.some(nome => nome !== MIGRATION)) throw Error('SCHEMA_DEV_DIFERENTE: pendencias fora do ajuste: ' + state.pending.join(', '));
  const [antes] = await db.query(COLUNA_SQL);
  const colunaValida = colunas => colunas.length === 1 && colunas[0].tipo === 'json' && colunas[0].anulavel === 'YES';
  if (antes.length && !colunaValida(antes)) throw Error('COLUNA_DEV_DIFERENTE. Nenhuma migration aplicada.');
  const [tls] = await db.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (env.dbSslCaFile && !tls[0]?.Value) throw Error('TLS_DEV_DIFERENTE. Certificado configurado mas conexao sem TLS.');
  log('DEV conferido: processo8001, identidade MySQL, flags e schema. TLS: ' + (tls[0]?.Value ? 'ativo' : 'nao configurado no ambiente atual'));
  log('Migrations pendentes: ' + (state.pending.join(', ') || 'nenhuma'));
  if (modo === '--verificar' && state.pending.length) { log('Somente leitura. Nenhuma migration aplicada.'); return; }
  if (modo === '--aplicar' && state.pending.includes(MIGRATION)) {
    if (runtimeEnv.CONFIRM_DEV_BACKUP !== 'SIM') throw Error('BACKUP_DEV_NAO_CONFIRMADO. Exige CONFIRM_DEV_BACKUP=SIM.');
    // O runner e estrutural; nenhuma outra migration pendente e admitida.
    const anterior = runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
    try {
      runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true';
      await schema.runMigrations({ authorized: true });
    } finally {
      if (anterior === undefined) delete runtimeEnv.ALLOW_SCHEMA_MIGRATIONS;
      else runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = anterior;
    }
  }
  await schema.assertMigrationsUpToDate();
  const [depois] = await db.query(COLUNA_SQL);
  if (!colunaValida(depois)) throw Error('COLUNA_DEV_NAO_CONFIRMADA. Nao reinicie; confira o schema.');
  log('Migration e JSON nullable conferidos. Sem backfill, baixa, renegociacao, alteracao de cadastro ou processo.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || !['--verificar', '--aplicar'].includes(process.argv[2])) throw Error('Use --verificar ou --aplicar.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const processos = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    // Todas as guardas de ambiente antes de instanciar o cliente de banco.
    conferirAmbiente({ modo: '--verificar', cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env, processos });
    const db = require('../src/database');
    try {
      await executar({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env,
        validateRequiredEnv, db, schema: require('../src/database/runMigrations'), processos });
    } finally { await db.close(); }
  })().catch(e => {
    console.error('MIGRATION DEV INTERROMPIDA:', /^(Use |EXCLUSIVO_DEV|PROCESSO_DEV_|BANCO_DEV_|SCHEMA_DEV_|COLUNA_DEV_|TLS_DEV_|BACKUP_DEV_|Configuracao |ALLOW_SCHEMA_|Flag |PAYMENT_OWNER_)/.test(e.message)
      ? e.message : 'Confira conectividade/schema no DEV; nao compartilhe credenciais. Codigo: ' + (e.original?.code || e.code || e.name));
    process.exitCode = 1;
  });
}
module.exports = { executar, MIGRATION, BACKEND, IDENTIDADE_SQL, COLUNA_SQL };
