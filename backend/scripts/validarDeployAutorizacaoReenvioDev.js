'use strict';
// Fixtures de leitura MySQL. Nao abre conexao/PM2, nao envia push.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verificar, TABELAS } = require('./verificarReenvioAutorizacaoDev');
const { UUID, conferirAmbiente, HOST, BACKEND } = require('./verificarPermutasMySqlDev');
async function caso(tipo = 'ok') {
  const comandos = [], logs = [];
  const conexao = { async query(sql, params) {
    comandos.push(sql); assert(/^(SELECT|SET SESSION MAX_EXECUTION_TIME|SET TRANSACTION|START TRANSACTION READ ONLY|ROLLBACK)\b/.test(sql));
    assert(!sql.includes(';'));
    if (sql.includes('server_uuid')) return [[{ uuid: tipo === 'producao' ? '5ed4b970-009f-11f1-809c-0ad0e0c90c53' : UUID, banco: 'gestao_solicitacoes' }]];
    if (sql.includes('information_schema.tables')) return [TABELAS.filter(t => tipo !== 'schema' || t !== 'notificacoes').map(tabela => ({ tabela }))];
    if (sql.includes('configuracoes_sistema')) return [[{ valor: JSON.stringify({ eventos: { PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE: { ativo: tipo !== 'evento_off' } } }) }]];
    if (sql.includes('GROUP BY')) return [[{ lote_id: 151, itens_autorizados: 1 }]];
    if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
    if (sql.includes('a.usuario_id=?')) { assert.deepEqual(params, [31]); return [tipo === 'usuario' ? [] : [{ usuario_id: 31 }]]; }
    if (sql.includes('WHERE lote_id=?')) { assert.deepEqual(params, [151]); return [tipo === 'sem_pendente' ? [] : [{ id: 7 }]]; }
    return [[]];
  } };
  const env = { paymentOwnerApprovalMode: tipo === 'pausado' ? 'PAUSED' : 'PILOT', webPushVapidPublicKey: 'segredo-publico', webPushVapidPrivateKey: tipo === 'sem_vapid' ? '' : 'segredo-privado', webPushVapidSubject: 'mailto:qa@example.invalid' };
  const args = { conexao, env, log: value => logs.push(value), ...(tipo === 'ok' ? {} : { usuarioId: tipo === 'ids' ? 0 : 31, loteId: 151 }) };
  if (tipo === 'ok') { const resultado = await verificar(args); assert.equal(resultado.vapid_configurado, true); }
  else await assert.rejects(verificar(args));
  assert(!JSON.stringify(logs).includes('segredo'));
  if (tipo === 'producao') assert.equal(comandos.length, 1);
  else assert.equal(comandos.at(-1), 'ROLLBACK');
}
(async () => {
  for (const tipo of ['ok', 'producao', 'schema', 'evento_off', 'usuario', 'sem_pendente', 'ids', 'pausado', 'sem_vapid']) await caso(tipo);
  const ambiente = { modo: '--verificar', cwd: BACKEND, env: { deploymentEnvironment: 'development', port: 8001, dbHost: HOST, dbName: 'gestao_solicitacoes' },
    runtimeEnv: {}, processos: [{ name: 'backend-dev', pm2_env: { pm_exec_path: BACKEND + '/server.js', watch: false, PORT: 8001 } }] };
  conferirAmbiente(ambiente);
  for (const delta of [{ cwd: '/home/ubuntu/sistema-gestao-solicitacoes-main/backend' },
    { env: { ...ambiente.env, deploymentEnvironment: 'production' } }, { env: { ...ambiente.env, port: 8000 } },
    { env: { ...ambiente.env, dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com' } },
    { runtimeEnv: { ALLOW_SCHEMA_MIGRATIONS: 'true' } }]) assert.throws(() => conferirAmbiente({ ...ambiente, ...delta }));
  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-dev-autorizacao-reenvio-20261019.sh'), 'utf8');
  const merge = shell.indexOf('git merge --ff-only'), restart = shell.indexOf('pm2 restart backend-dev');
  assert(shell.indexOf('p.watch') < merge);
  assert(shell.indexOf('configurarSessao12hDev.js --verificar') < merge);
  assert(shell.indexOf('verificarReenvioAutorizacaoDev.js --verificar') > merge);
  assert(shell.indexOf('verificarReenvioAutorizacaoDev.js --verificar') < restart);
  assert(shell.match(/test "\$env_hash_dev"/g).length >= 3);
  for (const trecho of ['flock -n 9', 'git merge-base --is-ancestor HEAD', 'git diff --quiet db1d2253', 'backend/migrations', 'http://127.0.0.1:8001/health']) assert(shell.includes(trecho));
  assert(!/--aplicar|--testar-push|--update-env|backend-solicitacoes|\bssh\b|npm run migrate|ALLOW_SCHEMA_MIGRATIONS=true/.test(shell));
  assert.equal((shell.match(/pm2 restart backend-dev/g) || []).length, 1);
  console.log('Deploy reenvio DEV: bootstrap antes do merge, schema/UUID DEV, sem DDL, READ ONLY/rollback, modo de push explicito, .env/flags e restart exclusivo aprovados. Sem EC2/banco/push/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
