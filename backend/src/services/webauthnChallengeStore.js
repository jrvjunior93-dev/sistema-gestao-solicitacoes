const { env } = require('../config/env');
const { getRedisClient } = require('./rateLimitStore');

const TTL_SECONDS = 5 * 60;

function keyFor({ purpose, userId, lotId = 'none' }) {
  return `${env.redisKeyPrefix}webauthn:${purpose}:${Number(userId)}:${lotId}`;
}

async function saveChallenge(context, challenge) {
  const redis = await getRedisClient();
  if (!redis) {
    const error = new Error('Redis e obrigatorio para desafios de autorizacao por passkey.');
    error.statusCode = 503;
    error.code = 'WEBAUTHN_CHALLENGE_STORE_UNAVAILABLE';
    throw error;
  }
  await redis.set(keyFor(context), JSON.stringify(challenge), { EX: TTL_SECONDS });
}

async function consumeChallenge(context) {
  const redis = await getRedisClient();
  if (!redis) {
    const error = new Error('Redis e obrigatorio para desafios de autorizacao por passkey.');
    error.statusCode = 503;
    error.code = 'WEBAUTHN_CHALLENGE_STORE_UNAVAILABLE';
    throw error;
  }
  const key = keyFor(context);
  const challenge = await redis.get(key);
  if (challenge) await redis.del(key);
  if (!challenge) return null;
  try { return JSON.parse(challenge); } catch (_) { return { challenge }; }
}

module.exports = { saveChallenge, consumeChallenge };
