const { createClient } = require('redis');
const { env } = require('../config/env');

const localHits = new Map();

let redisClientPromise = null;
let redisUnavailableLogged = false;

function buildRedisRequiredError(message = 'Redis e obrigatorio para o rate limit neste ambiente.') {
  const error = new Error(message);
  error.code = 'RATE_LIMIT_REDIS_REQUIRED';
  return error;
}

async function getRedisClient() {
  if (!env.redisUrl) {
    if (env.redisRequired) {
      throw buildRedisRequiredError('REDIS_URL obrigatorio para inicializar o rate limit em producao.');
    }
    return null;
  }

  if (!redisClientPromise) {
    const client = createClient({ url: env.redisUrl });
    client.on('error', (error) => {
      if (!redisUnavailableLogged) {
        redisUnavailableLogged = true;
        console.error(
          env.redisRequired
            ? 'Rate limit Redis indisponivel.'
            : 'Rate limit Redis indisponivel, fallback local ativo:',
          error.message
        );
      }
    });

    redisClientPromise = client.connect()
      .then(() => client)
      .catch((error) => {
        if (!redisUnavailableLogged) {
          redisUnavailableLogged = true;
          console.error(
            env.redisRequired
              ? 'Falha ao conectar Redis para rate limit.'
              : 'Falha ao conectar Redis para rate limit, fallback local ativo:',
            error.message
          );
        }
        if (env.redisRequired) {
          throw buildRedisRequiredError('Falha ao conectar Redis obrigatorio para o rate limit.');
        }
        return null;
      });
  }

  return redisClientPromise;
}

async function incrementWithRedis(key, windowMs) {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const namespacedKey = `${env.redisKeyPrefix}ratelimit:${key}`;
  const count = await client.incr(namespacedKey);
  if (count === 1) {
    await client.pExpire(namespacedKey, windowMs);
  }

  const ttlMs = await client.pTtl(namespacedKey);
  return {
    count,
    expiresAt: Date.now() + Math.max(0, Number(ttlMs || 0))
  };
}

function incrementWithLocalMap(key, windowMs) {
  const now = Date.now();
  const current = localHits.get(key);

  if (!current || current.expiresAt <= now) {
    const nextValue = {
      count: 1,
      expiresAt: now + windowMs
    };
    localHits.set(key, nextValue);
    return nextValue;
  }

  current.count += 1;
  return current;
}

async function incrementRateLimitHit(key, windowMs) {
  const redisValue = await incrementWithRedis(key, windowMs).catch((error) => {
    if (env.redisRequired) {
      throw error;
    }
    return null;
  });
  if (redisValue) {
    return redisValue;
  }

  return incrementWithLocalMap(key, windowMs);
}

async function ensureRateLimitStoreReady() {
  if (!env.redisRequired) {
    return;
  }

  await getRedisClient();
}

module.exports = {
  getRedisClient,
  incrementRateLimitHit,
  ensureRateLimitStoreReady
};
