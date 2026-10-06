const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const multer = require('multer');
const app = express();

const { env } = require('./config/env');
const db = require('./models');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');
const { getRuntimeInstallationConfig } = require('./services/runtimeConfig');
const { createComprasPerformanceMiddleware } = require('./observability/comprasPerformance');
const bloquearAnexoLocalRemovido = require('./middlewares/bloquearAnexoLocalRemovido');

const uploadMaxMb = env.uploadMaxFileSizeMb;
const requestBodyLimit = `${Math.max(1, env.requestBodyLimitMb)}mb`;
const isProduction = env.nodeEnv === 'production';
const dangerousInlineUploadExtensions = new Set(['.htm', '.html', '.js', '.mjs', '.svg', '.xhtml', '.xml']);

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

function matchesOriginPattern(origin, pattern) {
  const normalizedPattern = String(pattern || '').trim();
  if (!normalizedPattern) return false;
  if (normalizedPattern === origin) return true;

  if (!normalizedPattern.includes('*')) {
    return false;
  }

  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  return regex.test(origin);
}

/**
 * Origem da MAQUINA DE DESENVOLVIMENTO — inclusive quando ela e alcancada pela rede local (21/08).
 *
 * Antes so `localhost` e `127.0.0.1` passavam, e abrir o sistema de outro aparelho da rede
 * (`http://192.168.1.66:5273`) era recusado com 403 e `[CORS_BLOCKED]` no log.
 *
 * As faixas aceitas sao as PRIVADAS da RFC 1918 — 10.x, 172.16–31.x e 192.168.x —, que por
 * definicao nao roteiam na internet: quem chega por um endereco desses esta na mesma rede fisica.
 * Faixa, e nao IP fixo, porque o endereco da maquina vem de DHCP e muda sozinho.
 *
 * Vale SO fora de producao: `isProduction` guarda a chamada, e la as origens continuam vindo da
 * configuracao da instalacao. Sem essa guarda, isto seria um buraco atras de um proxy reverso.
 *
 * `CORS_ALLOWED_ORIGINS` nao resolveria: o `allowed_origins` que vale em tempo de execucao vem da
 * linha `INSTALACAO_CONFIG` no banco (os dominios de producao), e a variavel de ambiente so serve
 * de padrao quando essa linha nao existe. Mexer nela para liberar um IP local sujaria a
 * configuracao que vai para producao.
 */
function isLocalOrigin(origin) {
  const limpo = String(origin || '').trim();
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(limpo)) return true;
  return /^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(limpo);
}

function createCorsBlockedError(origin) {
  const error = new Error('Not allowed by CORS');
  error.statusCode = 403;
  error.code = 'CORS_ORIGIN_BLOCKED';
  error.origin = origin;
  return error;
}

function shouldForceAttachmentForUploadPath(filePath = '') {
  const extension = String(path.extname(String(filePath || '').split('?')[0]) || '').toLowerCase();
  return dangerousInlineUploadExtensions.has(extension);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!isProduction && isLocalOrigin(origin)) {
      return callback(null, true);
    }

    const config = getRuntimeInstallationConfig();
    const allowedOrigins = Array.isArray(config?.allowed_origins)
      ? config.allowed_origins
      : [];

    if (allowedOrigins.some((item) => matchesOriginPattern(origin, item))) {
      return callback(null, true);
    }

    console.warn('[CORS_BLOCKED]', JSON.stringify({
      origin,
      allowed_origins_count: allowedOrigins.length
    }));
    return callback(createCorsBlockedError(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'Idempotency-Key',
    'X-Audit-Session-Id'
  ],
  exposedHeaders: ['X-CSRF-Token', 'X-Idempotent-Replay', 'X-Painel-Valores-Ocultos', 'Retry-After'],
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(helmet({
  contentSecurityPolicy: isProduction
    ? {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
          frameSrc: ["'self'", 'blob:', 'https:']
        }
      }
    : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: { action: 'deny' },
  hsts: isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    : false,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' }
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(createComprasPerformanceMiddleware({
  enabled: env.comprasPerformanceEnabled,
  sampleRate: env.comprasPerformanceSampleRate,
  slowQueryThresholdMs: env.comprasPerformanceSlowQueryMs
}));
app.use(express.json({
  limit: requestBodyLimit,
  verify: (req, res, buf) => {
    if (String(req.originalUrl || '').includes('/api/crm/webhooks/')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: requestBodyLimit }));

app.use(
  '/uploads',
  bloquearAnexoLocalRemovido,
  express.static(path.resolve(__dirname, '..', 'uploads'), {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      if (!shouldForceAttachmentForUploadPath(filePath)) {
        return;
      }

      const safeFileName = path.basename(filePath).replace(/"/g, '');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    }
  })
);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Experience Sync — rota separada, protegida por API key (não usa JWT do CORE)
const experienceSyncRouter = require('./routes/experienceSyncRouter');
app.use('/api/experience-sync', experienceSyncRouter);
app.use('/experience-sync', experienceSyncRouter);

// Experience Leads - entrada isolada para CRM, protegida por secret
const experienceLeadRouter = require('./routes/experienceLeadRouter');
app.use('/api/experience', experienceLeadRouter);
app.use('/experience', experienceLeadRouter);

// Core Gateway - camada oficial e auditada para consumo do FLUXY Experience
const coreGatewayRouter = require('./modules/coreGateway');
app.use('/api/gateway', coreGatewayRouter);

app.use('/api', routes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Arquivo excede o limite de ${uploadMaxMb}MB.` });
    }
    return res.status(400).json({ error: 'Falha no upload do arquivo.' });
  }

  if (Number(err?.statusCode || 0) > 0) {
    return res.status(Number(err.statusCode)).json({ error: err.message || 'Falha na validacao de upload.' });
  }

  if (err && /Tipo de arquivo/i.test(String(err.message || ''))) {
    return res.status(400).json({ error: 'Tipo de arquivo nao permitido.' });
  }

  return next(err);
});

app.use((err, req, res, next) => {
  if (err?.code === 'CORS_ORIGIN_BLOCKED') {
    console.warn('[CORS_BLOCKED_REQUEST]', JSON.stringify({
      origin: err.origin || req.headers.origin || null,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      user_agent: req.headers['user-agent'] || null
    }));
    return res.status(403).json({ error: 'Origem nao autorizada por CORS.' });
  }

  console.error('Erro nao tratado na API:', err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

const staticDir = path.resolve(__dirname, '..', 'public');
const indexFile = path.join(staticDir, 'index.html');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('*', (req, res, next) => {
  if (!fs.existsSync(indexFile)) return next();
  return res.sendFile(indexFile);
});

module.exports = app;
