'use strict';
// Importacao pura. CLI exclusivamente de leitura; nao importa transporte push.
const assert = require('node:assert/strict');
const { NOTIFICACAO_CONFIG_CHAVE } = require('../src/constants/notificacaoEventos');
const { conferirProducao } = require('./promoverSchemaProducao20261018');
const { mensagemSegura } = require('./verificarFinanceiroProducao20261019');
const TABELAS = ['pagamento_autorizacao_lotes', 'pagamento_autorizacao_itens', 'pagamento_autorizacao_eventos',
  'pagamento_autorizadores', 'notificacoes', 'notificacao_destinatarios', 'web_push_subscriptions', 'webauthn_credentials'];
const UUID = '5ed4b970-009f-11f1-809c-0ad0e0c90c53';

function conferirPushPersistido({ arquivo, processo, runtimeEnv }) {
  for (const chave of ['WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT']) {
    for (const origem of [arquivo, processo]) {
      if (origem[chave] !== undefined) assert(String(origem[chave]) === String(runtimeEnv[chave] ?? ''), 'PUSH_CONFIG_DIVERGENTE');
    }
    // Configuracao apenas no terminal nao seria herdada no restart sem update-env.
    if (arquivo[chave] === undefined && processo[chave] === undefined) assert(!runtimeEnv[chave], 'PUSH_APENAS_NO_TERMINAL');
  }
}

async function verificar({ conexao, env, log = console.log }) {
  const [ids] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  assert(ids[0]?.uuid === UUID && ids[0]?.banco === 'gestao_solicitacoes', 'BANCO_PRODUCAO_DIFERENTE');
  const [tls] = await conexao.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  assert(['Ssl_cipher', 'Ssl_version'].every(nome => tls.some(r => r.Variable_name === nome && r.Value)), 'TLS_NAO_CONFIRMADO');
  await conexao.query('SET SESSION MAX_EXECUTION_TIME = 10000');
  await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conexao.query('START TRANSACTION READ ONLY');
  try {
    const [tables] = await conexao.query(`SELECT TABLE_NAME AS tabela FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${TABELAS.map(() => '?').join(',')})`, TABELAS);
    assert(TABELAS.every(t => tables.some(r => r.tabela === t)), 'SCHEMA_REENVIO_INCOMPLETO');
    const [config] = await conexao.query('SELECT valor FROM configuracoes_sistema WHERE chave=? ORDER BY id DESC LIMIT 1', [NOTIFICACAO_CONFIG_CHAVE]);
    const eventos = config[0]?.valor ? JSON.parse(config[0].valor) : {};
    const regra = (eventos.eventos || eventos).PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE;
    const [autores] = await conexao.query('SELECT COUNT(*) AS total FROM pagamento_autorizadores a JOIN users u ON u.id=a.usuario_id WHERE a.ativo=1 AND u.ativo=1');
    const [pushes] = await conexao.query('SELECT COUNT(*) AS total FROM web_push_subscriptions WHERE ativo=1');
    const [chaves] = await conexao.query('SELECT COUNT(*) AS total FROM webauthn_credentials WHERE ativo=1');
    const [itens] = await conexao.query("SELECT COUNT(*) AS total FROM pagamento_autorizacao_itens WHERE status='AUTORIZADO'");
    const diagnostico = { modo: env.paymentOwnerApprovalMode,
      evento_ativo: typeof regra === 'object' ? regra?.ativo !== false : regra !== false,
      vapid_configurado: Boolean(env.webPushVapidPublicKey && env.webPushVapidPrivateKey && env.webPushVapidSubject),
      autorizadores_ativos: Number(autores[0].total), assinaturas_push_ativas: Number(pushes[0].total),
      passkeys_ativas: Number(chaves[0].total), itens_autorizados_aguardando_envio: Number(itens[0].total) };
    log(JSON.stringify({ prontidao_producao: diagnostico }));
    log('Contagens/configuracao nao comprovam permissao granular nem entrega no dispositivo. Nenhum push foi enviado.');
    return diagnostico;
  } finally { await conexao.query('ROLLBACK'); }
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--verificar') throw Error('Use somente --verificar.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const db = require('../src/database');
    try {
      await conferirProducao({ cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db, execFileSync: cp.execFileSync });
      await require('../src/database/runMigrations').assertMigrationsUpToDate();
      const arquivo = require('dotenv').parse(fs.readFileSync('.env', 'utf8'));
      const processo = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'backend-solicitacoes').pm2_env;
      conferirPushPersistido({ arquivo, processo, runtimeEnv: process.env });
    } finally { await db.close(); }
    const conexao = await require('mysql2/promise').createConnection({ host: env.dbHost, port: env.dbPort,
      user: env.dbUser, password: env.dbPassword, database: env.dbName, dateStrings: true,
      connectTimeout: 8000, multipleStatements: false,
      ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } });
    try { await verificar({ conexao, env }); } finally { await conexao.end(); }
    console.log('REENVIO PRODUCAO: MySQL somente leitura, sem migration, push, decisao, fila ou configuracao alterada.');
  })().catch(e => { console.error('VERIFICACAO REENVIO PRODUCAO INTERROMPIDA:', e.code || e.name, mensagemSegura(e)); process.exitCode = 1; });
}
module.exports = { verificar, conferirPushPersistido, TABELAS, UUID };
