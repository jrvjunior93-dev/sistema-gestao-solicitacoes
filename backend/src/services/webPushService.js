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

async function hasActiveSubscription(userId) {
  if (!userId || !isConfigured()) return false;
  return Boolean(await WebPushSubscription.count({ where: { usuario_id: userId, ativo: true } }));
}

function logPushDiagnostic(level, marker, details = {}) {
  const safeDetails = {
    reason: details.reason || null,
    recipient_count: Number(details.recipient_count || 0),
    subscription_count: Number(details.subscription_count || 0),
    subscription_id: details.subscription_id ? Number(details.subscription_id) : null,
    user_id: details.user_id ? Number(details.user_id) : null,
    status_code: details.status_code ? Number(details.status_code) : null,
    sent_count: Number(details.sent_count || 0),
    failed_count: Number(details.failed_count || 0),
    deactivated_count: Number(details.deactivated_count || 0)
  };
  console[level](`[payment-owner-push-${marker}]`, JSON.stringify(safeDetails));
}

async function sendPendingAuthorizationNotification(userIds) {
  const recipients = Array.from(new Set((userIds || []).map(Number).filter(Boolean)));
  if (!recipients.length) return { sent: 0, failed: 0, deactivated: 0, skipped: true, reason: 'NO_RECIPIENTS' };
  if (!configure()) {
    logPushDiagnostic('warn', 'skipped', { reason: 'VAPID_NOT_CONFIGURED', recipient_count: recipients.length });
    return { sent: 0, failed: 0, deactivated: 0, skipped: true, reason: 'VAPID_NOT_CONFIGURED' };
  }
  const subscriptions = await WebPushSubscription.findAll({ where: { usuario_id: { [Op.in]: recipients }, ativo: true } });
  if (!subscriptions.length) {
    logPushDiagnostic('warn', 'skipped', { reason: 'NO_ACTIVE_SUBSCRIPTIONS', recipient_count: recipients.length });
    return { sent: 0, failed: 0, deactivated: 0, skipped: true, reason: 'NO_ACTIVE_SUBSCRIPTIONS' };
  }
  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({
        title: 'Fluxy · autorização necessária',
        body: 'Há pagamentos aguardando sua decisão segura.',
        url: '/financeiro/autorizacoes-pagamento'
      }), { TTL: 300, urgency: 'high' });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = Number(error.statusCode || error.status || 0) || null;
      if ([404, 410].includes(statusCode)) {
        await row.update({ ativo: false });
        deactivated += 1;
      }
      logPushDiagnostic('error', 'delivery-failed', {
        reason: [404, 410].includes(statusCode) ? 'SUBSCRIPTION_EXPIRED' : 'PROVIDER_REJECTED',
        subscription_id: row.id,
        user_id: row.usuario_id,
        status_code: statusCode,
        subscription_count: subscriptions.length
      });
    }
  }));
  logPushDiagnostic('info', 'delivery-summary', {
    recipient_count: recipients.length,
    subscription_count: subscriptions.length,
    sent_count: sent,
    failed_count: failed,
    deactivated_count: deactivated
  });
  return { sent, failed, deactivated, skipped: false, reason: null };
}

module.exports = { isConfigured, saveSubscription, removeSubscription, hasActiveSubscription, sendPendingAuthorizationNotification };
