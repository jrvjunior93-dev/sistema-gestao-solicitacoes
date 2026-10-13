'use strict';

// One-shot supervisionado. Nao importado pelo servidor nem pelo deploy Vercel.
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main';
const BASE = '0efa82ce13ebaf475cb17891a04896cbfe18a630';
const SOURCE = '447a1dcaf785bbf7cb3c05e0db400e1d9d3ecec5';
const ALLOWED = Object.freeze([
  '202610130001_rh_ticket_pix_colaboradores.js',
  '202610130002_fila_liquidacao_rateada.js'
]);

function conferirEstado({ mode, expectedSha, sha, cwd, script, uuid, banco, port,
  deploymentEnvironment, devUserSwitchEnabled, tableExists, files, pending,
  executedCount, backupConfirmed, migrationAuthorized }) {
  if (!['--preflight', '--aplicar'].includes(mode)) throw Error('Modo invalido.');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || sha !== expectedSha) throw Error('Commit diferente do alvo congelado.');
  if (cwd !== ROOT + '/backend' || script !== ROOT + '/backend/server.js') throw Error('Checkout/processo de producao divergente.');
  if (uuid !== '5ed4b970-009f-11f1-809c-0ad0e0c90c53' || banco !== 'gestao_solicitacoes') throw Error('Identidade de producao divergente.');
  if (port !== 8000 || deploymentEnvironment === 'development' || devUserSwitchEnabled) throw Error('Configuracao de desenvolvimento bloqueada em producao.');
  if (!tableExists || files.length !== 266 || new Set(files).size !== 266 ||
    ALLOWED.some(name => !files.includes(name)) || pending.some(name => !ALLOWED.includes(name)) ||
    new Set(pending).size !== pending.length || executedCount + pending.length !== 266) {
    throw Error('Estado de migrations divergente: somente as duas expansoes deste release sao permitidas.');
  }
  if (mode === '--aplicar' && (!backupConfirmed || !migrationAuthorized)) throw Error('Backup e autorizacao explicita de schema exigidos.');
}

async function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const [mode, expectedSha] = process.argv.slice(2);
  if (process.argv.length !== 4) throw Error('Informe --preflight ou --aplicar e o SHA congelado.');
  const cwd = fs.realpathSync(process.cwd());
  if (cwd !== ROOT + '/backend') throw Error('Executar exclusivamente no backend de producao.');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const sha = git('rev-parse', 'HEAD');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || sha !== expectedSha) throw Error('Commit divergente.');
  git('merge-base', '--is-ancestor', BASE, sha);
  git('merge-base', '--is-ancestor', SOURCE, sha);
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const targets = processes.filter(item => item.name === 'backend-solicitacoes');
  if (targets.length !== 1) throw Error('Processo de producao ausente ou ambiguo.');
  const pmEnv = targets[0].pm2_env;
  const script = fs.realpathSync(pmEnv.pm_exec_path);
  if (script !== ROOT + '/backend/server.js') throw Error('Caminho do processo incorreto.');
  // Conferir a mesma configuracao efetiva que o processo usara, sem imprimir segredos.
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'DB_SSL_CA_FILE', 'PORT', 'DEPLOYMENT_ENV', 'DEV_USER_SWITCH_ENABLED']) {
    if (pmEnv[key] !== undefined) process.env[key] = String(pmEnv[key]);
  }
  const { env, validateRequiredEnv } = require('../src/config/env');
  validateRequiredEnv();
  const db = require('../src/database');
  const { getMigrationState, runMigrations, assertMigrationsUpToDate,
    assertMigrationSourceIsSchemaOnly } = require('../src/database/runMigrations');
  try {
    const [[identity]] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    const state = await getMigrationState();
    const files = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter(name => name.endsWith('.js'));
    conferirEstado({ mode, expectedSha, sha, cwd, script, ...identity, port: env.port,
      deploymentEnvironment: env.deploymentEnvironment, devUserSwitchEnabled: env.devUserSwitchEnabled,
      tableExists: state.tableExists, files, pending: state.pending, executedCount: state.executed.size,
      backupConfirmed: process.env.PROD_RELEASE_BACKUP_CONFIRMED === 'true',
      migrationAuthorized: process.env.ALLOW_SCHEMA_MIGRATIONS === 'true' });
    for (const name of ALLOWED) {
      const file = path.resolve(__dirname, '../migrations', name);
      const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (source !== git('show', SOURCE + ':backend/migrations/' + name) + '\n') throw Error('Migration alterada em relacao ao alvo aprovado.');
      assertMigrationSourceIsSchemaOnly(name, source);
    }
    console.log('Identidade, processo, commit e migrations de producao conferidos.');
    console.table(state.pending.map(migration => ({ migration_pendente: migration })));
    if (mode === '--preflight') {
      console.log('Somente leitura. Nenhum schema/dado alterado.');
      return;
    }
    await runMigrations({ authorized: true });
    await assertMigrationsUpToDate();
    console.log('Schema pronto. Sem seed/backfill ou operacao de negocio; registro em schema_migrations atualizado.');
  } finally {
    await db.close();
  }
}

if (require.main === module) main().catch(error => {
  console.error('PARADA: conferir o estado antes de repetir.', error.message);
  process.exitCode = 1;
});
module.exports = { conferirEstado, ALLOWED, BASE, SOURCE };
