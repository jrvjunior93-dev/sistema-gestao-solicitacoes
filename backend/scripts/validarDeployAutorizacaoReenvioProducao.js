'use strict';
// Sem .env, PM2, banco ou push real. Guardas produtivas tambem cobertas na suite existente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verificar, conferirPushPersistido, TABELAS, UUID } = require('./verificarReenvioAutorizacaoProducao');
async function caso(tipo) {
  const comandos = [], logs = [];
  const conexao = { async query(sql, params) {
    comandos.push(sql);
    assert(/^(SELECT|SHOW|SET SESSION MAX_EXECUTION_TIME|SET TRANSACTION|START TRANSACTION READ ONLY|ROLLBACK)\b/.test(sql));
    assert(!sql.includes(';'));
    if (sql.includes('server_uuid')) return [[{ uuid: tipo === 'dev' ? 'uuid-dev' : UUID, banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW')) return [tipo === 'tls' ? [] : [{ Variable_name: 'Ssl_cipher', Value: 'cipher' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
    if (sql.includes('information_schema')) { assert.deepEqual(params, TABELAS); return [TABELAS.filter(t => tipo !== 'schema' || t !== 'notificacoes').map(tabela => ({ tabela }))]; }
    if (sql.includes('configuracoes_sistema')) return [[{ valor: tipo === 'json' ? '{' : JSON.stringify({ eventos: { PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE: { ativo: tipo !== 'desativado' } } }) }]];
    if (sql.includes('COUNT(*)')) return [[{ total: tipo === 'vazio' ? 0 : 1 }]];
    return [[]];
  } };
  const args = { conexao, env: { paymentOwnerApprovalMode: 'PILOT', webPushVapidPublicKey: 'nao-exibir-publica',
    webPushVapidPrivateKey: 'nao-exibir-privada', webPushVapidSubject: 'nao-exibir-subject' }, log: v => logs.push(v) };
  if (['dev', 'tls', 'schema', 'json'].includes(tipo)) await assert.rejects(verificar(args));
  else { const r = await verificar(args); assert.equal(r.evento_ativo, tipo !== 'desativado'); }
  assert(!JSON.stringify(logs).includes('nao-exibir'));
  if (!['dev', 'tls'].includes(tipo)) assert.equal(comandos.at(-1), 'ROLLBACK');
  else assert(!comandos.includes('START TRANSACTION READ ONLY'));
}
(async () => {
  for (const tipo of ['ok', 'vazio', 'desativado', 'dev', 'tls', 'schema', 'json']) await caso(tipo);
  const config = { WEB_PUSH_VAPID_PUBLIC_KEY: 'nao-exibir', WEB_PUSH_VAPID_PRIVATE_KEY: 'nao-exibir', WEB_PUSH_VAPID_SUBJECT: 'nao-exibir' };
  conferirPushPersistido({ arquivo: config, processo: config, runtimeEnv: config });
  conferirPushPersistido({ arquivo: {}, processo: {}, runtimeEnv: {} });
  for (const chave of Object.keys(config)) {
    assert.throws(() => conferirPushPersistido({ arquivo: config, processo: { ...config, [chave]: 'outro' }, runtimeEnv: config }), e => !e.message.includes('nao-exibir'));
    assert.throws(() => conferirPushPersistido({ arquivo: {}, processo: {}, runtimeEnv: { [chave]: 'nao-exibir' } }), e => !e.message.includes('nao-exibir'));
  }
  const shell = fs.readFileSync(path.resolve(__dirname, '../../ops/deploy/atualizar-producao-autorizacao-reenvio-20261019.sh'), 'utf8');
  const merge = shell.indexOf('git merge --ff-only'), restart = shell.indexOf('pm2 restart backend-solicitacoes');
  assert(shell.indexOf('verificarFinanceiroProducao20261019.js --verificar') < merge);
  assert(shell.indexOf('verificarReenvioAutorizacaoProducao.js --verificar') > merge);
  assert(shell.indexOf('verificarReenvioAutorizacaoProducao.js --verificar') < restart);
  assert(shell.lastIndexOf('verificarReenvioAutorizacaoProducao.js --verificar') > restart);
  for (const trecho of ['CONFIRM_PROD_BACKUP', 'CONFIRM_PROD_BACKUP_TIMER', 'systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'flock -n 9', 'git merge-base --is-ancestor HEAD', 'git diff --quiet 72e628e8', 'backend/migrations',
    'backend/package-lock.json', 'http://127.0.0.1:8000/health']) assert(shell.includes(trecho), trecho);
  assert(shell.match(/test "\$env_hash_prod"/g).length >= 3);
  assert.equal((shell.match(/pm2 restart backend-solicitacoes/g) || []).length, 1);
  assert(!/--aplicar|--testar-push|--update-env|pm2 restart (?:backend-dev|all)|\bssh\b|npm run migrate|ALLOW_SCHEMA_MIGRATIONS=true|simularRegularizacaoTitulos/.test(shell));
  console.log('Deploy reenvio PRODUCAO: bootstrap main72, schema sem DDL, transacao READ ONLY/rollback, UUID/TLS, push sem segredos, backup/timer, .env e restart exclusivo aprovados. Sem EC2/banco/push/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
