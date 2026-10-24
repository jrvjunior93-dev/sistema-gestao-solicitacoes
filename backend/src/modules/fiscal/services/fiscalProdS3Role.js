'use strict';
const POLICY = require('./fiscalProdS3Policy.json');
const ROLE = 'arn:aws:iam::992500432025:role/FluxyFiscalProd';
const ROLE_USER = 'arn:aws:sts::992500432025:assumed-role/FluxyFiscalProd/fluxy-fiscal-prod';
const CWD = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
function check(ok, code) { if (!ok) { const e = Error(code); e.code = code; throw e; } }
function createCredentialsProvider(config, env = process.env, deps = {}) {
  check(env.DEPLOYMENT_ENV === 'production' && Number(env.PORT) === 8000
    && (deps.cwd || require('node:fs').realpathSync(process.cwd())) === CWD
    && config.bucket === 'fluxy-fiscal-prod' && config.region === 'us-east-2' && config.prefix === 'prod'
    && env.FISCAL_S3_ROLE_ARN === ROLE && env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'FISCAL_S3_PROD_CONTEXTO_INVALIDO');
  check(Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY), 'FISCAL_S3_PROD_ORIGEM_AUSENTE');
  const source = { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN ? {sessionToken: env.AWS_SESSION_TOKEN} : {}) };
  let cached, pending;
  const now = deps.clock || Date.now;
  return async () => {
    // Minimo15min remanescentes garante os links assinados de ate900s. A AWS
    // limita a URL tambem pela expiracao da credencial temporaria.
    if (cached && cached.expiration.getTime() - now() > 900000) return cached;
    if (!pending) pending = (async () => {
      const { STSClient, AssumeRoleCommand } = deps.sdk || require('@aws-sdk/nested-clients/sts');
      const client = deps.client || new STSClient({ region: 'us-east-2', endpoint: 'https://sts.us-east-2.amazonaws.com',
        maxAttempts: 1, credentials: source });
      try {
        const r = await client.send(new AssumeRoleCommand({ RoleArn: ROLE, RoleSessionName: 'fluxy-fiscal-prod',
          DurationSeconds: 3600, Policy: JSON.stringify(POLICY) }), { abortSignal: AbortSignal.timeout(15000) });
        const c = r.Credentials;
        check(r.AssumedRoleUser?.Arn === ROLE_USER && c?.AccessKeyId && c.SecretAccessKey && c.SessionToken
          && c.Expiration instanceof Date && c.Expiration.getTime() - now() > 900000, 'FISCAL_S3_PROD_SESSAO_INVALIDA');
        cached = { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey,
          sessionToken: c.SessionToken, expiration: c.Expiration };
        return cached;
      } catch (e) {
        cached = null;
        check(false, e.code === 'FISCAL_S3_PROD_SESSAO_INVALIDA' ? e.code : 'FISCAL_S3_PROD_ASSUME_ROLE_RECUSADO');
      } finally { client.destroy(); }
    })().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { ROLE, ROLE_USER, CWD, POLICY, createCredentialsProvider };
