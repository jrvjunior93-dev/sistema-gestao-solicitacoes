'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { conferirEstado, ALLOWED, SOURCE } = require('./releaseProducao20261013');
// Este gate pertence ao release congelado de 13/10, nao ao inventario atual.
// Manter a fixture historica e comprovar que expansoes futuras continuam negadas.
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', SOURCE, 'backend/migrations/'], {
  cwd: path.resolve(__dirname, '../..'), encoding: 'utf8'
}).trim().split('\n').filter(name => name.endsWith('.js')).map(name => path.basename(name));
const filesAtuais = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter(name => name.endsWith('.js'));
const base = { mode: '--preflight', expectedSha: 'a'.repeat(40), sha: 'a'.repeat(40),
  cwd: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend',
  script: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js',
  uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes', port: 8000,
  deploymentEnvironment: 'production', devUserSwitchEnabled: false,
  tableExists: true, files, pending: [...ALLOWED], executedCount: 264 };
conferirEstado(base);
conferirEstado({ ...base, pending: [], executedCount: 266 });
conferirEstado({ ...base, pending: [ALLOWED[1]], executedCount: 265 });
conferirEstado({ ...base, mode: '--aplicar', backupConfirmed: true, migrationAuthorized: true });
if (filesAtuais.some(name => !files.includes(name))) {
  assert.throws(() => conferirEstado({ ...base, files: filesAtuais }), /Estado de migrations divergente/);
}
for (const changed of [
  { mode: 'migrate' }, { expectedSha: 'main' }, { sha: 'b'.repeat(40) },
  { cwd: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend' },
  { script: '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js' },
  { uuid: '60f043e9-4025-11f1-9a61-06d8a063012d' }, { banco: 'outro' },
  { port: 8001 }, { deploymentEnvironment: 'development' }, { devUserSwitchEnabled: true },
  { tableExists: false }, { files: files.slice(1) }, { pending: ['migration_antiga.js'] },
  { pending: [ALLOWED[0], ALLOWED[0]] }, { executedCount: 263 },
  { mode: '--aplicar' }, { mode: '--aplicar', backupConfirmed: true },
  { mode: '--aplicar', migrationAuthorized: true }
]) assert.throws(() => conferirEstado({ ...base, ...changed }));

// Revisao estatica isolada: sem importar singleton/banco/env reais.
const vm = require('node:vm');
const runnerText = fs.readFileSync(path.resolve(__dirname, '../src/database/runMigrations.js'), 'utf8');
const runner = { exports: {} };
const requireFake = id => {
  if (id === 'sequelize') return { Sequelize: {} };
  if (id === '../config/env') return { validateRequiredEnv() {} };
  if (id === './index') return {};
  return require(id);
};
vm.runInNewContext(runnerText, { require: requireFake, module: runner,
  __dirname: path.resolve(__dirname, '../src/database'), console, process: { env: {} } });
for (const name of ALLOWED) {
  const text = fs.readFileSync(path.resolve(__dirname, '../migrations', name), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(text, execFileSync('git', ['show', SOURCE + ':backend/migrations/' + name], { encoding: 'utf8' }));
  runner.exports.assertMigrationSourceIsSchemaOnly(name, text);
}
assert.throws(() => runner.exports.assertMigrationSourceIsSchemaOnly('bad.js', 'INSERT INTO users VALUES(1)'));
assert.throws(() => runner.exports.assertMigrationSourceIsSchemaOnly('bad.js', 'UPDATE users SET nome="x"'));
console.log('OK: gates de commit/processo/UUID/porta, flags, backup, estado exato e duas migrations imutaveis sem DML. Sem banco/PM2/rede.');
