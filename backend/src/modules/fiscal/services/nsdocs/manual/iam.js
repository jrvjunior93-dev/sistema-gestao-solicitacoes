'use strict';
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/nested-clients/sts');
const { check } = require('./policy');
const { assertDevProcess } = require('./runtime');
const SESSION_POLICY = require('./iam-dev-policy.json');
const ACCOUNT = '992500432025';
const ROLE = `arn:aws:iam::${ACCOUNT}:role/FluxyNsdocsFiscalDev`;
const SESSION_NAME = 'fluxy-nsdocs-dev';

function createDevCredentialsProvider(config, env = process.env, dependencies = {}) {
  // Esta sessao nao altera process.env, arquivos de chave ou clientes globais.
  // Promise unica: nenhum fallback para o usuario original se STS falhar.
  let pending;
  return () => pending ||= (async () => {
    (dependencies.guard || assertDevProcess)();
    check(config.owner === ACCOUNT && config.roleArn === ROLE, 'NSDOCS_IAM_ROLE_DEV_DIVERGENTE');
    check(typeof env.AWS_ACCESS_KEY_ID === 'string' && env.AWS_ACCESS_KEY_ID.length > 0 &&
      typeof env.AWS_SECRET_ACCESS_KEY === 'string' && env.AWS_SECRET_ACCESS_KEY.length > 0,
    'NSDOCS_IAM_CREDENCIAL_ORIGEM_AUSENTE');
    const source = { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY };
    if (env.AWS_SESSION_TOKEN) source.sessionToken = env.AWS_SESSION_TOKEN;
    const options = { region: 'us-east-2', endpoint: 'https://sts.us-east-2.amazonaws.com',
      maxAttempts: 1, credentials: source };
    const client = dependencies.client || new STSClient(options);
    try {
      const response = await client.send(new AssumeRoleCommand({ RoleArn: ROLE,
        RoleSessionName: SESSION_NAME, DurationSeconds: 900, Policy: JSON.stringify(SESSION_POLICY) }),
      { abortSignal: AbortSignal.timeout(15000) });
      const credentials = response.Credentials;
      const expiration = credentials?.Expiration;
      check(response.AssumedRoleUser?.Arn === `arn:aws:sts::${ACCOUNT}:assumed-role/FluxyNsdocsFiscalDev/${SESSION_NAME}` &&
        credentials && typeof credentials.AccessKeyId === 'string' && credentials.AccessKeyId.length > 0 &&
        typeof credentials.SecretAccessKey === 'string' && credentials.SecretAccessKey.length > 0 &&
        typeof credentials.SessionToken === 'string' && credentials.SessionToken.length > 0 &&
        expiration instanceof Date && expiration.getTime() - (dependencies.clock || Date.now)() >= 180000,
      'NSDOCS_IAM_SESSAO_DEV_INVALIDA');
      return { accessKeyId: credentials.AccessKeyId, secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken, expiration };
    } catch (error) {
      if (error.code === 'NSDOCS_IAM_SESSAO_DEV_INVALIDA') throw error;
      check(false, 'NSDOCS_IAM_ASSUME_ROLE_DEV_RECUSADO');
    } finally { client.destroy(); }
  })();
}
module.exports = { ACCOUNT, ROLE, SESSION_NAME, SESSION_POLICY, createDevCredentialsProvider };
