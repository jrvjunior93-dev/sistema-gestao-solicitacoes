const crypto = require('crypto');
const net = require('net');
const webpush = require('web-push');
const { Op } = require('sequelize');
const { env } = require('../config/env');
const { WebPushSubscription } = require('../models');

let configured = false;

function isConfigured() {
  return Boolean(env.webPushVapidPublicKey && env.webPushVapidPrivateKey && env.webPushVapidSubject);
}

function configure() {
  if (!configured && isConfigured()) {
    webpush.setVapidDetails(env.webPushVapidSubject, env.webPushVapidPublicKey, env.webPushVapidPrivateKey);
    configured = true;
  }
  return configured;
}

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || '')).digest('hex');
}

function validateEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch (_) {
    const error = new Error('Endpoint push invalido.'); error.statusCode = 400; throw error;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || endpoint.length > 2048 || hostname === 'localhost' || hostname.endsWith('.local') || net.isIP(hostname)) {
    const error = new Error('Endpoint push nao permitido.'); error.statusCode = 400; throw error;
  }
}

async function saveSubscription(userId, subscription = {}) {
  if (!isConfigured()) {
    const error = new Error('Notificacoes push nao estao configuradas neste ambiente.');
    error.statusCode = 503;
    throw error;
  }
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    const error = new Error('Assinatura push invalida.');
    error.statusCode = 400;
    throw error;
  }
  validateEndpoint(endpoint);
  const hash = endpointHash(endpoint);
  const [row] = await WebPushSubscription.findOrCreate({
    where: { endpoint_hash: hash },
    defaults: { usuario_id: userId, endpoint_hash: hash, endpoint, p256dh, auth, ativo: true }
  });
  await row.update({ usuario_id: userId, endpoint, p256dh, auth, ativo: true });
  return { subscribed: true };
}

async function removeSubscription(userId, endpoint) {
  const hash = endpointHash(endpoint);
  await WebPushSubscription.update({ ativo: false }, { where: { usuario_id: userId, endpoint_hash: hash } });
  return { subscribed: false };
}

async function sendPendingAuthorizationNotification(userIds) {
  if (!configure() || !userIds.length) return { sent: 0, skipped: true };
  const subscriptions = await WebPushSubscription.findAll({ where: { usuario_id: { [Op.in]: userIds }, ativo: true } });
  let sent = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({
        title: 'Fluxy · autorização necessária',
        body: 'Há pagamentos aguardando sua decisão segura.',
        url: '/financeiro/autorizacoes-pagamento'
      }), { TTL: 300, urgency: 'high' });
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(Number(error.statusCode))) await row.update({ ativo: false });
    }
  }));
  return { sent, skipped: false };
}

module.exports = { isConfigured, saveSubscription, removeSubscription, sendPendingAuthorizationNotification };
