const fs = require('fs');
const path = require('path');

const { Sequelize } = require('sequelize');
const { validateRequiredEnv } = require('../config/env');
const sequelize = require('./index');

const MIGRATIONS_TABLE = 'schema_migrations';
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');
const DATA_MUTATION_PATTERNS = [
  { label: 'queryInterface de dados', pattern: /\.(?:bulkInsert|bulkUpdate|bulkDelete|insert|update|delete|upsert|create|bulkCreate|destroy)\s*\(/i },
  { label: 'INSERT SQL', pattern: /\bINSERT\s+INTO\b/i },
  { label: 'UPDATE SQL', pattern: /\bUPDATE\s+(?:`[^`]+`|[A-Z0-9_.]+)\s+SET\b/i },
  { label: 'DELETE SQL', pattern: /\bDELETE\s+FROM\b/i },
  { label: 'REPLACE SQL', pattern: /\bREPLACE\s+INTO\b/i },
  { label: 'MERGE SQL', pattern: /\bMERGE\s+INTO\b/i },
  { label: 'TRUNCATE SQL', pattern: /\bTRUNCATE\s+(?:TABLE\s+)?/i },
  { label: 'LOAD DATA SQL', pattern: /\bLOAD\s+DATA\b/i },
  { label: 'CREATE TABLE AS SELECT', pattern: /\bCREATE\s+TABLE\b[\s\S]*?\bAS\s+SELECT\b/i }
];

async function ensureMigrationsTable() {
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function migrationsTableExists() {
  const [rows] = await sequelize.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = :tableName
      LIMIT 1`,
    {
      replacements: { tableName: MIGRATIONS_TABLE }
    }
  );

  return rows.length > 0;
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b));
}

function findDataMutation(source) {
  const text = String(source || '');
  return DATA_MUTATION_PATTERNS.find(({ pattern }) => pattern.test(text)) || null;
}

function assertMigrationSourceIsSchemaOnly(fileName, source) {
  const violation = findDataMutation(source);
  if (!violation) return;

  const error = new Error(
    `Migration ${fileName} bloqueada: contem ${violation.label}. ` +
    'Migrations de deploy podem alterar somente a estrutura; cadastros, seeds e backfills devem passar pela interface.'
  );
  error.code = 'MIGRATION_DATA_MUTATION_BLOCKED';
  error.migration = fileName;
  throw error;
}

function assertSqlIsSchemaOnly(sql, fileName) {
  const statement = typeof sql === 'string' ? sql : sql?.query;
  const violation = findDataMutation(statement);
  if (!violation) return;

  const error = new Error(
    `Migration ${fileName} tentou executar ${violation.label}. ` +
    'A execucao foi interrompida antes da operacao de dados.'
  );
  error.code = 'MIGRATION_DATA_MUTATION_BLOCKED';
  error.migration = fileName;
  throw error;
}

async function getExecutedMigrations() {
  const [rows] = await sequelize.query(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY executed_at ASC`
  );

  return new Set(rows.map((row) => String(row.name)));
}

async function getMigrationState() {
  const files = getMigrationFiles();
  const tableExists = await migrationsTableExists();

  if (!tableExists) {
    return {
      tableExists,
      executed: new Set(),
      pending: files
    };
  }

  const executed = await getExecutedMigrations();
  return {
    tableExists,
    executed,
    pending: files.filter((fileName) => !executed.has(fileName))
  };
}

async function assertMigrationsUpToDate() {
  const state = await getMigrationState();

  if (!state.tableExists) {
    const error = new Error(
      `A tabela ${MIGRATIONS_TABLE} nao existe. ` +
      'Inicializacao cancelada sem alterar o banco.'
    );
    error.code = 'MIGRATIONS_TABLE_MISSING';
    throw error;
  }

  if (state.pending.length > 0) {
    const preview = state.pending.slice(0, 10).join(', ');
    const suffix = state.pending.length > 10 ? ` e mais ${state.pending.length - 10}` : '';
    const error = new Error(
      `${state.pending.length} migration(s) pendente(s): ${preview}${suffix}. ` +
      'Inicializacao cancelada sem alterar o banco.'
    );
    error.code = 'MIGRATIONS_PENDING';
    error.pendingMigrations = state.pending;
    throw error;
  }

  console.log('Schema conferido em modo somente leitura: nenhuma migration pendente.');
  return state;
}

function schemaMigrationExplicitlyAuthorized(options = {}) {
  return options.authorized === true &&
    String(process.env.ALLOW_SCHEMA_MIGRATIONS || '').trim().toLowerCase() === 'true';
}

async function runMigrations(options = {}) {
  if (!schemaMigrationExplicitlyAuthorized(options)) {
    const error = new Error(
      'Execucao de migrations bloqueada. Exige autorizacao explicita e ' +
      'ALLOW_SCHEMA_MIGRATIONS=true; nao habilite esta flag em dev-v2 ou main sem uma aprovacao separada.'
    );
    error.code = 'SCHEMA_MIGRATIONS_NOT_AUTHORIZED';
    throw error;
  }

  const files = getMigrationFiles();
  const tableExists = await migrationsTableExists();
  const executed = tableExists ? await getExecutedMigrations() : new Set();
  const pendingFiles = files.filter((fileName) => !executed.has(fileName));

  for (const fileName of pendingFiles) {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    assertMigrationSourceIsSchemaOnly(fileName, fs.readFileSync(filePath, 'utf8'));
  }

  if (!tableExists) {
    await ensureMigrationsTable();
  }

  for (const fileName of pendingFiles) {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    delete require.cache[require.resolve(filePath)];
    const migration = require(filePath);

    if (!migration || typeof migration.up !== 'function') {
      throw new Error(`Migration invalida: ${fileName}`);
    }

    const qi = sequelize.getQueryInterface();
    const originalAddColumn = qi.addColumn.bind(qi);
    const originalQuery = sequelize.query;
    const blockedMethods = ['bulkInsert', 'bulkUpdate', 'bulkDelete', 'insert', 'update', 'delete', 'upsert'];
    const originalMethods = new Map();

    sequelize.query = async (sql, ...args) => {
      assertSqlIsSchemaOnly(sql, fileName);
      return originalQuery.call(sequelize, sql, ...args);
    };

    for (const methodName of blockedMethods) {
      if (typeof qi[methodName] !== 'function') continue;
      originalMethods.set(methodName, qi[methodName]);
      qi[methodName] = async () => {
        const error = new Error(
          `Migration ${fileName} tentou executar queryInterface.${methodName}(). ` +
          'A operacao de dados foi bloqueada.'
        );
        error.code = 'MIGRATION_DATA_MUTATION_BLOCKED';
        error.migration = fileName;
        throw error;
      };
    }

    qi.addColumn = async (table, column, definition, options) => {
      const desc = await qi.describeTable(table).catch(() => ({}));
      if (desc[column]) return;
      return originalAddColumn(table, column, definition, options);
    };

    try {
      await migration.up({
        DataTypes: Sequelize.DataTypes,
        queryInterface: qi,
        sequelize
      });
    } finally {
      qi.addColumn = originalAddColumn;
      sequelize.query = originalQuery;
      for (const [methodName, originalMethod] of originalMethods) {
        qi[methodName] = originalMethod;
      }
    }

    await sequelize.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (${sequelize.escape(fileName)})`
    );

    console.log(`Migration aplicada: ${fileName}`);
  }
}

if (require.main === module) {
  validateRequiredEnv();
  runMigrations({ authorized: true })
    .then(() => {
      console.log('Migrations concluidas');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Erro ao executar migrations', error);
      process.exit(1);
    });
}

module.exports = {
  assertMigrationsUpToDate,
  assertMigrationSourceIsSchemaOnly,
  assertSqlIsSchemaOnly,
  getMigrationState,
  runMigrations
};
