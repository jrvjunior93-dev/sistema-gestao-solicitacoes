'use strict';

const { QueryTypes } = require('sequelize');
const { env } = require('../src/config/env');
const { sequelize } = require('../src/models');
const { getRedisClient } = require('../src/services/rateLimitStore');

const REQUIRED_TABLES = [
  'pagamento_autorizadores', 'pagamento_autorizacao_lotes', 'pagamento_autorizacao_itens',
  'pagamento_autorizacao_documentos', 'pagamento_autorizacao_eventos',
  'webauthn_credentials', 'web_push_subscriptions'
];

async function main() {
  const tables = (await sequelize.getQueryInterface().showAllTables()).map((item) => String(item).toLowerCase());
  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  if (missing.length) throw new Error(`Schema de autorizacao incompleto: ${missing.join(', ')}`);
  const countRows = await sequelize.query(`SELECT
    (SELECT COUNT(*) FROM pagamento_autorizadores WHERE ativo = 1) AS autorizadores,
    (SELECT COUNT(*) FROM webauthn_credentials WHERE ativo = 1) AS passkeys,
    (SELECT COUNT(*) FROM pagamento_autorizacao_lotes WHERE status = 'AGUARDANDO') AS aguardando`, { type: QueryTypes.SELECT });
  const counts = countRows[0] || { autorizadores: 0, passkeys: 0, aguardando: 0 };
  const vapidParts = [env.webPushVapidPublicKey, env.webPushVapidPrivateKey, env.webPushVapidSubject].filter(Boolean).length;
  if (vapidParts > 0 && vapidParts < 3) throw new Error('Configuracao VAPID parcial: informe chave publica, privada e subject ou deixe as tres vazias.');
  if (env.paymentOwnerApprovalMode !== 'OFF') {
    if (!env.webauthnRpId || !env.webauthnOrigins.length) throw new Error('WEBAUTHN_RP_ID e WEBAUTHN_ORIGINS sao obrigatorios fora de OFF.');
    if (env.webauthnOrigins.some((origin) => !origin.startsWith('https://'))) throw new Error('Toda origem WebAuthn deve usar HTTPS.');
    if (!env.redisUrl || !(await getRedisClient())) throw new Error('Redis obrigatorio para desafios WebAuthn.');
    if (Number(counts.autorizadores) < 1) throw new Error('Nenhum autorizador nominal ativo.');
    if (Number(counts.passkeys) < 1 && env.paymentOwnerApprovalMode === 'ENFORCED') throw new Error('ENFORCED exige ao menos uma passkey ativa.');
  }
  console.table({ modo: env.paymentOwnerApprovalMode, rp_id: env.webauthnRpId || '-', origins: env.webauthnOrigins.join(',') || '-', ...counts });
  console.log('Preflight somente leitura concluido. Nenhum dado foi alterado.');
}

main().catch((error) => { console.error('Preflight bloqueado:', error.message); process.exitCode = 1; }).finally(() => sequelize.close());
