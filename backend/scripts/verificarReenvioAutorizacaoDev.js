'use strict';
// Importacao pura. CLI --verificar nunca envia push nem altera dados.
const assert = require('node:assert/strict');
const { UUID } = require('./verificarPermutasMySqlDev');
const { NOTIFICACAO_CONFIG_CHAVE } = require('../src/constants/notificacaoEventos');
const TABELAS = ['pagamento_autorizacao_lotes', 'pagamento_autorizacao_itens', 'pagamento_autorizacao_eventos',
  'pagamento_autorizadores', 'notificacoes', 'notificacao_destinatarios', 'web_push_subscriptions', 'webauthn_credentials'];
const EVENTO = 'PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE';

async function verificar({ conexao, env, usuarioId, loteId, log = console.log }) {
  const [id] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  assert(id[0]?.uuid === UUID && id[0]?.banco === 'gestao_solicitacoes', 'BANCO_DEV_DIFERENTE');
  await conexao.query('SET SESSION MAX_EXECUTION_TIME = 10000');
  await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conexao.query('START TRANSACTION READ ONLY');
  let pronto;
  try {
    const [tables] = await conexao.query(`SELECT TABLE_NAME AS tabela FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${TABELAS.map(() => '?').join(',')})`, TABELAS);
    assert(TABELAS.every(t => tables.some(r => r.tabela === t)), 'SCHEMA_REENVIO_INCOMPLETO');
    const [config] = await conexao.query('SELECT valor FROM configuracoes_sistema WHERE chave=? ORDER BY id DESC LIMIT 1', [NOTIFICACAO_CONFIG_CHAVE]);
    const eventos = config[0]?.valor ? JSON.parse(config[0].valor) : {};
    const regra = (eventos.eventos || eventos)[EVENTO];
    const eventoAtivo = typeof regra === 'object' ? regra?.ativo !== false : regra !== false;
    const [autores] = await conexao.query('SELECT COUNT(*) AS total FROM pagamento_autorizadores a JOIN users u ON u.id=a.usuario_id WHERE a.ativo=1 AND u.ativo=1');
    const [pushes] = await conexao.query('SELECT COUNT(*) AS total FROM web_push_subscriptions WHERE ativo=1');
    const [chaves] = await conexao.query('SELECT COUNT(*) AS total FROM webauthn_credentials WHERE ativo=1');
    const [lotes] = await conexao.query("SELECT lote_id,COUNT(*) AS itens_autorizados FROM pagamento_autorizacao_itens WHERE status='AUTORIZADO' GROUP BY lote_id ORDER BY lote_id DESC LIMIT 5");
    pronto = { modo: env.paymentOwnerApprovalMode, evento_ativo: eventoAtivo,
      vapid_configurado: Boolean(env.webPushVapidPublicKey && env.webPushVapidPrivateKey && env.webPushVapidSubject),
      autorizadores_ativos: Number(autores[0].total), assinaturas_push_ativas: Number(pushes[0].total), passkeys_ativas: Number(chaves[0].total) };
    if (usuarioId !== undefined || loteId !== undefined) {
      assert(Number.isSafeInteger(usuarioId) && usuarioId > 0 && Number.isSafeInteger(loteId) && loteId > 0, 'IDS_TESTE_INVALIDOS');
      const [usuario] = await conexao.query('SELECT a.usuario_id FROM pagamento_autorizadores a JOIN users u ON u.id=a.usuario_id WHERE a.usuario_id=? AND a.ativo=1 AND u.ativo=1', [usuarioId]);
      const [itens] = await conexao.query("SELECT id FROM pagamento_autorizacao_itens WHERE lote_id=? AND status='AUTORIZADO' LIMIT 1", [loteId]);
      assert(usuario.length && itens.length, 'TESTE_EXIGE_AUTORIZADOR_ATIVO_E_LOTE_COM_ENVIO_PENDENTE');
      assert(pronto.evento_ativo && pronto.vapid_configurado && ['PILOT', 'ENFORCED'].includes(pronto.modo), 'AVISOS_DEV_NAO_PRONTOS');
    }
    log(JSON.stringify({ prontidao_dev: pronto, lotes_com_envio_pendente: lotes }));
    log('Contagens nao comprovam permissao granular nem entrega no dispositivo. Conferir com login real; sem Testar usuario.');
  } finally { await conexao.query('ROLLBACK'); }
  log('Conferencia MySQL DEV somente leitura concluida. Nenhuma decisao, fila, titulo ou configuracao alterado.');
  return pronto;
}

if (require.main === module) {
  (async () => {
    const modo = process.argv[2], teste = modo === '--testar-push';
    if (!(modo === '--verificar' && process.argv.length === 3) && !(teste && process.argv.length === 5)) {
      throw Error('Use --verificar ou --testar-push USUARIO_ID LOTE_ID. Exclusivo DEV.');
    }
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const db = require('../src/database');
    try {
      await require('./configurarSessao12hDev').executar({ modo: '--verificar', cwd: fs.realpathSync(process.cwd()), env,
        runtimeEnv: process.env, validateRequiredEnv, db, schema: require('../src/database/runMigrations'), execFileSync: cp.execFileSync });
      require('./verificarPermutasMySqlDev').conferirAmbiente({ modo: '--verificar', cwd: fs.realpathSync(process.cwd()), env,
        runtimeEnv: process.env, processos: JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })) });
      const usuarioId = teste ? Number(process.argv[3]) : undefined, loteId = teste ? Number(process.argv[4]) : undefined;
      const conexao = await require('mysql2/promise').createConnection({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
        password: env.dbPassword, database: env.dbName, dateStrings: true, connectTimeout: 8000, multipleStatements: false,
        ...(env.dbSslCaFile ? { ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } } : {}) });
      try { await verificar({ conexao, env, usuarioId, loteId }); } finally { await conexao.end(); }
      if (teste) {
        const { User } = require('../src/models');
        const user = await User.findByPk(usuarioId);
        assert(await require('../src/services/authorizationService').userHasNominalAreaPermission(user, ['financeiro.autorizacoes_pagamento.decidir']), 'SEM_GRANULAR_DECISAO');
        const resultado = await require('../src/services/webPushService').sendQueueRetryNotification([usuarioId], loteId);
        console.log(JSON.stringify({ teste_push_dev: resultado }));
        if (!resultado.sent) throw Error('PUSH_NAO_ENTREGUE: confira opt-in, assinatura e diagnostico seguro.');
        console.log('Push enviado. Nao aprova nem reenvia titulos. Somente assinaturas expiradas podem ter sido inativadas.');
      }
    } finally { await db.close(); }
  })().catch(e => { console.error('REENVIO DEV INTERROMPIDO:', e.code || e.name,
    /^(BANCO_DEV_DIFERENTE|SCHEMA_REENVIO_INCOMPLETO|IDS_TESTE_INVALIDOS|TESTE_EXIGE_|AVISOS_DEV_|SEM_GRANULAR_|PUSH_NAO_ENTREGUE|Use --)/.test(e.message) ? e.message : 'Confira ambiente/schema/configuracao. Nao compartilhe segredos.'); process.exitCode = 1; });
}
module.exports = { verificar, TABELAS };
