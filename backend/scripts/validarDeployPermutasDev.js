'use strict';
// Executavel sem EC2, banco, PM2, .env ou rede reais.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const mysql = require('mysql2');
const v = require('./verificarPermutasMySqlDev');
const fixture = () => ({ modo: '--verificar', cwd: v.BACKEND,
  env: { deploymentEnvironment: 'development', port: 8001, dbHost: v.HOST, dbName: 'gestao_solicitacoes' },
  runtimeEnv: {}, processos: [{ name: 'backend-dev', pm2_env: { pm_exec_path: v.BACKEND + '/server.js', PORT: 8001, watch: false } }] });
function fake(uuid = v.UUID, falha = false) {
  const chamadas = [];
  return { chamadas, async query(sql) {
    chamadas.push(sql);
    if (sql.includes('@@GLOBAL.server_uuid')) return [[{ uuid, banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW SESSION')) return [[{ Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
    if (/^SELECT/.test(sql)) {
      if (falha) throw Error('Falha SQL simulada');
      return /COUNT\(\*\)/.test(sql) ? [[{ total: 0, pagamentos: 0, recebimentos: 0, estornados: 0 }]] : [[]];
    }
    if (sql.startsWith('EXPLAIN FORMAT=JSON')) return [[{ EXPLAIN: JSON.stringify({ query_block: { table: { table_name: 'm', access_type: 'ALL', rows_examined_per_scan: 0 } } }) }]];
    assert(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION READ ONLY', 'ROLLBACK'].includes(sql), sql);
    return [[]];
  } };
}
(async () => {
  v.conferirAmbiente(fixture());
  for (const alterar of [f => f.modo = '--aplicar', f => f.cwd = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend',
    f => f.env.deploymentEnvironment = 'production', f => f.env.port = 8000, f => f.env.dbHost = 'producao',
    f => f.env.dbName = 'outro', f => f.processos = [], f => f.processos.push(f.processos[0]),
    f => f.processos[0].pm2_env.watch = true, f => f.processos[0].pm2_env.PORT = 8000,
    f => f.processos[0].pm2_env.pm_exec_path = '/outro/server.js',
    f => f.processos[0].pm2_env.DB_HOST = 'producao', f => f.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS = 'true']) {
    const f = fixture(); alterar(f); assert.throws(() => v.conferirAmbiente(f));
  }
  assert.equal(v.sqlSeguro('SELECT :valor AS x WHERE 1 IN (:obras)', { valor: "a'b", obras: [1, 2] }, mysql.escape), "SELECT 'a\\'b' AS x WHERE 1 IN (1, 2)");
  for (const sql of ['DELETE FROM x', 'UPDATE x SET y=1', 'SELECT 1; DELETE FROM x', 'INSERT INTO x VALUES(1)']) assert.throws(() => v.sqlSeguro(sql, {}, mysql.escape));
  assert.throws(() => v.sqlSeguro('SELECT :ausente', {}, mysql.escape));
  const conexao = fake(), logs = [];
  await v.executar({ conexao, escape: mysql.escape, log: s => logs.push(s) });
  assert.equal(conexao.chamadas.at(-1), 'ROLLBACK');
  assert(conexao.chamadas.includes('START TRANSACTION READ ONLY'));
  assert.equal(logs.filter(s => s.includes('"consulta":')).length, 18);
  assert(logs.some(s => s.startsWith('PERMUTAS MYSQL DEV APROVADO')));
  const errado = fake('uuid-producao');
  await assert.rejects(v.executar({ conexao: errado, escape: mysql.escape, log: () => {} }), /BANCO_DEV_DIFERENTE/);
  assert.equal(errado.chamadas.length, 1);
  const falha = fake(v.UUID, true), erros = [];
  await assert.rejects(v.executar({ conexao: falha, escape: mysql.escape, log: s => erros.push(s) }), /Falha SQL/);
  assert.equal(falha.chamadas.at(-1), 'ROLLBACK');
  assert(!erros.some(s => s.startsWith('PERMUTAS MYSQL DEV APROVADO')));
  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-permutas-20261018.sh'), 'utf8');
  for (const texto of ['set -euo pipefail', 'flock -n 9', 'git merge --ff-only', 'git status --porcelain --untracked-files=no',
    'git merge-base --is-ancestor HEAD', 'scripts/configurarSessao12hDev.js --verificar',
    'scripts/verificarPermutasMySqlDev.js --verificar', 'http://127.0.0.1:8001/health']) assert(shell.includes(texto), texto);
  assert(shell.indexOf('p.watch') < shell.indexOf('git merge --ff-only'));
  assert(shell.indexOf('scripts/verificarPermutasMySqlDev.js --verificar') < shell.indexOf('pm2 restart backend-dev'));
  assert.deepEqual(shell.match(/^pm2\s+.+$/gm), ['pm2 restart backend-dev']);
  assert(!/--update-env|npm run migrate|--aplicar\b|\bssh\b|backend-solicitacoes/.test(shell));
  const { validateForbiddenTerms } = require('./validarDocumentacao');
  const inventario = path.resolve(__dirname, '../../docs/datas/INVENTARIO_CAMPOS_DATAS.md');
  const evidencias = [];
  validateForbiddenTerms(inventario, '| backend/src/models/IntegracaoSiengeFila.js:29 | COLUNA_BANCO | enviado_em | DataTypes.DATE |', evidencias);
  assert.equal(evidencias.length, 0, 'Referencia tecnica historica nao e reativacao de modulo');
  validateForbiddenTerms(inventario, 'Habilitar SIENGE novamente.', evidencias);
  assert.equal(evidencias.length, 1, 'Prosa continua sujeita a regra documental');
  console.log('Deploy permutas DEV: identidade/PM2/UUID negativos, SQL real com fronteira simulada, transacao READ ONLY/rollback inclusive em falha, EXPLAIN, escaping, amostra vazia e roteiro DEV aprovados. Sem EC2/banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
