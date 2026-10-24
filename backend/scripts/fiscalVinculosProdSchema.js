'use strict';
// Operador exclusivo da migration de vinculos. Importacao pura: sem .env,
// conexao, PM2 ou DDL ate a chamada explicita. Nao usa o runner generico.
const fs = require('node:fs'), path = require('node:path');
const NAME = '202610240002_fiscal_vinculos_pedidos.js';
const DIRECTORY = path.resolve(__dirname, '../migrations');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const NODE = '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON = '/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const check = (ok, code) => { if (!ok) throw Error(code); };
function verifyStructure(columns, indices, partial = false) {
  const key = columns.find(c => c.COLUMN_NAME === 'purchase_link_key');
  const amount = columns.find(c => c.COLUMN_NAME === 'allocated_value');
  const index = indices.filter(i => i.INDEX_NAME === 'ux_fiscal_purchase_link').sort((a,b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX);
  return Boolean((!key && partial || key?.DATA_TYPE === 'varchar' && Number(key.CHARACTER_MAXIMUM_LENGTH) === 100 && key.IS_NULLABLE === 'YES')
    && (!amount && partial || amount?.DATA_TYPE === 'decimal' && Number(amount.NUMERIC_PRECISION) === 14 && Number(amount.NUMERIC_SCALE) === 2 && amount.IS_NULLABLE === 'YES')
    && (!index.length && partial || index.length === 2 && index.every(i => Number(i.NON_UNIQUE) === 0 && i.SUB_PART == null)
      && index.map(i => i.COLUMN_NAME).join(',') === 'fiscal_dfe_document_id,purchase_link_key'));
}
async function state(query, files = fs.readdirSync(DIRECTORY)) {
  const [ledger] = await query('SELECT name FROM schema_migrations ORDER BY name');
  const executed = new Set(ledger.map(r => r.name));
  const pending = files.filter(f => f.endsWith('.js') && !executed.has(f)).sort();
  check(pending.every(f => f === NAME), 'FISCAL_PROD_OUTRAS_MIGRATIONS_PENDENTES');
  const [columns] = await query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fiscal_document_links' AND COLUMN_NAME IN ('purchase_link_key','allocated_value')");
  const [indices] = await query("SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fiscal_document_links' AND INDEX_NAME='ux_fiscal_purchase_link'");
  check(verifyStructure(columns, indices, true), 'FISCAL_PROD_ESTRUTURA_PREEXISTENTE_INCOMPATIVEL');
  const structure = verifyStructure(columns, indices);
  check(!executed.has(NAME) || structure, 'FISCAL_PROD_LEDGER_E_SCHEMA_DIVERGENTES');
  return { migration: NAME, pending, applied: executed.has(NAME), structure_ok: structure };
}
function structuralSql(sql) {
  check(typeof sql === 'string', 'FISCAL_PROD_SQL_INVALIDO');
  // DDLs exatos emitidos pela migration/Sequelize MySQL. Nao aceitar sufixos,
  // segunda instrucao, outro alvo ou coluna adicional no mesmo ALTER.
  const allowed = [
    'ALTER TABLE `fiscal_document_links` ADD `purchase_link_key` VARCHAR(100)',
    'ALTER TABLE `fiscal_document_links` ADD `allocated_value` DECIMAL(14,2)',
    'ALTER TABLE `fiscal_document_links` ADD UNIQUE INDEX `ux_fiscal_purchase_link` (`fiscal_dfe_document_id`, `purchase_link_key`)'
  ];
  check(/^(?:SELECT|SHOW)\b/i.test(sql.trim()) && !/;\s*\S/.test(sql)
    || allowed.includes(sql.trim().replace(/;$/, '')), 'FISCAL_PROD_DDL_FORA_DO_ESCOPO');
}
async function identity(query) {
  const [[id]] = await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  check(id?.uuid === '5ed4b970-009f-11f1-809c-0ad0e0c90c53' && id.banco === 'gestao_solicitacoes', 'FISCAL_PROD_UUID_DIFERENTE');
  const [tls] = await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  check(tls.some(r => r.Variable_name === 'Ssl_cipher' && r.Value)
    && tls.some(r => r.Variable_name === 'Ssl_version' && /^TLSv1\.[23]$/.test(r.Value)), 'FISCAL_PROD_TLS_OBRIGATORIO');
}
async function apply(db, dependencies = {}) {
  const query = db.query.bind(db); let locked = false;
  try {
    await identity(query);
    const [[lock]] = await query("SELECT GET_LOCK('fluxy_fiscal_purchase_schema_prod', 0) AS acquired");
    check(Number(lock?.acquired) === 1, 'FISCAL_PROD_SCHEMA_OCUPADO'); locked = true;
    const before = await state(query, dependencies.files);
    db.query = async (sql, ...args) => { structuralSql(typeof sql === 'string' ? sql : sql?.query); return query(sql, ...args); };
    const migration = dependencies.migration || require(path.join(DIRECTORY, NAME));
    await migration.up(db.getQueryInterface(), dependencies.DataTypes || require('sequelize').DataTypes);
    db.query = query;
    const shape = await state(query, dependencies.files); check(shape.structure_ok, 'FISCAL_PROD_SCHEMA_INCOMPLETO');
    // MySQL DDL faz commit implicito. Ledger somente depois da forma completa.
    if (!before.applied) await query('INSERT INTO schema_migrations (name) VALUES (?)', { replacements: [NAME] });
    const after = await state(query, dependencies.files);
    check(after.applied && after.structure_ok, 'FISCAL_PROD_SCHEMA_FINAL_DIVERGENTE');
    return { ...after, applied_now: !before.applied };
  } finally {
    db.query = query;
    if (locked) await query("SELECT RELEASE_LOCK('fluxy_fiscal_purchase_schema_prod') AS released");
  }
}
async function main(args) {
  check(args.length === 1 && ['--conferir','--aplicar'].includes(args[0]), 'FISCAL_PROD_ARGUMENTOS_INVALIDOS');
  check(process.platform === 'linux' && process.arch === 'x64' && process.getuid() === 1000
    && fs.realpathSync(process.cwd()) === BACKEND && process.version === 'v24.22.1'
    && fs.realpathSync(process.execPath) === NODE && !process.env.NODE_OPTIONS, 'FISCAL_PROD_RUNTIME_DIFERENTE');
  const cp = require('node:child_process'), crypto = require('node:crypto');
  function execFileSync(bin, argv, opts = {}) {
    if (bin === 'pm2') {
      check(argv.length === 1 && argv[0] === 'jlist', 'FISCAL_PROD_PM2_COMANDO_NEGADO');
      const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim());
      check(pid > 1 && fs.readlinkSync(`/proc/${pid}/exe`) === DAEMON, 'FISCAL_PROD_DAEMON_DIFERENTE');
      return cp.execFileSync(DAEMON, ['/usr/lib/node_modules/pm2/bin/pm2', 'jlist'], { ...opts, timeout: 10000,
        env: { HOME: '/home/ubuntu', PM2_HOME: '/home/ubuntu/.pm2', PATH: '/usr/bin:/bin', LANG: 'C' } });
    }
    check(bin === 'systemctl' && JSON.stringify(argv) === JSON.stringify(['is-active','--quiet','fluxy-prod-db-backup.timer']), 'FISCAL_PROD_COMANDO_NEGADO');
    return cp.execFileSync('/usr/bin/systemctl', argv, { ...opts, timeout: 10000 });
  }
  const snapshot = () => {
    const ps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    const hashes = ['/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak', '/etc/systemd/system/pm2-ubuntu.service'];
    return JSON.stringify({ daemon: fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8'),
      apps: ps.map(p => ({ id: p.pm_id, pid: p.pid, name: p.name, status: p.pm2_env.status,
        node: fs.readlinkSync(`/proc/${p.pid}/exe`), env: crypto.createHash('sha256').update(fs.readFileSync(`/proc/${p.pid}/environ`)).digest('hex'),
        envFile: crypto.createHash('sha256').update(fs.readFileSync(p.pm2_env.pm_cwd + '/.env')).digest('hex') })),
      files: hashes.map(f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')) });
  };
  const before = snapshot();
  const { env, validateRequiredEnv } = require('../src/config/env'), { Sequelize } = require('sequelize');
  const db = new Sequelize(env.dbName, env.dbUser, env.dbPassword, { host: env.dbHost, port: env.dbPort, dialect: 'mysql', logging: false,
    pool: { max: 1, min: 0, idle: 600000, acquire: 15000 },
    dialectOptions: { connectTimeout: 10000, ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } } });
  let result, error;
  try {
    const files = fs.readdirSync(DIRECTORY).filter(f => f.endsWith('.js'));
    const schema = {
      async getMigrationState() {
        const [rows] = await db.query('SELECT name FROM schema_migrations'); const executed = new Set(rows.map(r => r.name));
        return { tableExists: true, executed, pending: files.filter(f => !executed.has(f) && f !== NAME).sort() };
      },
      async assertMigrationsUpToDate() { check(!(await this.getMigrationState()).pending.length, 'FISCAL_PROD_SCHEMA_ANTERIOR_PENDENTE'); }
    };
    // Verificadores PROD existentes: identidade, TLS, JSON,12h,flags e schema003.
    await require('./aplicarMigrationRetiradaEnviosProducao20261024').executar({ modo: '--concluido', cwd: BACKEND,
      env, validateRequiredEnv, db, schema, execFileSync, log() {} });
    await identity(db.query.bind(db));
    result = await state(db.query.bind(db), files);
    if (args[0] === '--aplicar') {
      check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_FISCAL_VINCULOS_PROD_SCHEMA']
        .every(k => process.env[k] === 'SIM'), 'FISCAL_PROD_BACKUP_TIMER_JANELA_CONFIRMACAO_OBRIGATORIOS');
      execFileSync('systemctl', ['is-active','--quiet','fluxy-prod-db-backup.timer']);
      result = await apply(db);
    }
  } catch (e) { error = e; }
  finally { await db.close(); }
  check(snapshot() === before, 'FISCAL_PROD_ESTADO_PM2_OU_CONFIG_MUDOU');
  if (error) throw error;
  return { outcome: 'FISCAL_VINCULOS_PROD_SCHEMA', ...result, processos_nodes_ambientes_dumps_preservados: true,
    reinicios: 0, chamadas_aws_nsdocs: 0, financeiro_alterado: false };
}
if (require.main === module) main(process.argv.slice(2)).then(r => console.log(JSON.stringify(r))).catch(e => {
  console.error(/^FISCAL_PROD_[A-Z0-9_]+$/.test(e.message || '') ? e.message : 'FISCAL_PROD_SCHEMA_INTERROMPIDO_SEM_EXIBIR_SEGREDOS'); process.exitCode = 1;
});
module.exports = { NAME, verifyStructure, state, structuralSql, identity, apply, main };
