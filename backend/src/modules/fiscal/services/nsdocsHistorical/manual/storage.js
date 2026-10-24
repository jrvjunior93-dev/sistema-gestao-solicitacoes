'use strict';
const { S3Client, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand,
  GetBucketOwnershipControlsCommand, GetBucketLocationCommand, GetBucketVersioningCommand,
  PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { check } = require('./policy');
const { sha256, MAX_XML_BYTES } = require('./xml');
const { ACCOUNT, ROLE, createProdCredentialsProvider } = require('./iam');

function storageConfig(env = process.env) {
  const bucket = env.FISCAL_S3_BUCKET;
  check(bucket === 'fluxy-fiscal-prod' && env.FISCAL_S3_REGION === 'us-east-2'
    && env.FISCAL_S3_PREFIX === 'prod' && env.FISCAL_S3_ROLE_ARN === ROLE,
    'NSDOCS_STORAGE_PROD_NAO_CONFIGURADO');
  check(!env.AWS_ENDPOINT_URL && !env.AWS_ENDPOINT_URL_S3, 'NSDOCS_STORAGE_ENDPOINT_NEGADO');
  return { bucket, region: 'us-east-2', owner: ACCOUNT, prefix: 'prod/nsdocs', roleArn: ROLE };
}
function createStorage(config, client = new S3Client({ region: config.region,
  endpoint: 'https://s3.us-east-2.amazonaws.com', maxAttempts: 1, followRegionRedirects: false,
  credentials: createProdCredentialsProvider(config) })) {
  const base = { Bucket: config.bucket, ExpectedBucketOwner: config.owner };
  const send = (Command, fields = {}, signal) => client.send(new Command({ ...base, ...fields }), { abortSignal: signal });
  const inspect = async (Command, stage, signal) => {
    try { return await send(Command, {}, signal); }
    catch { check(false, `NSDOCS_STORAGE_PREFLIGHT_${stage}`); }
  };
  return {
    config,
    async preflight(signal) {
      const location = await inspect(GetBucketLocationCommand, 'REGIAO', signal);
      check(location.LocationConstraint === config.region, 'NSDOCS_STORAGE_REGIAO_DIVERGENTE');
      const block = (await inspect(GetPublicAccessBlockCommand, 'BLOQUEIO_PUBLICO', signal)).PublicAccessBlockConfiguration;
      check(['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets']
        .every(key => block?.[key] === true), 'NSDOCS_STORAGE_NAO_PRIVADO');
      check((await inspect(GetBucketPolicyStatusCommand, 'POLICY', signal)).PolicyStatus?.IsPublic === false, 'NSDOCS_STORAGE_NAO_PRIVADO');
      check((await inspect(GetBucketOwnershipControlsCommand, 'OWNERSHIP', signal)).OwnershipControls?.Rules
        ?.some(rule => rule.ObjectOwnership === 'BucketOwnerEnforced'), 'NSDOCS_STORAGE_ACL_ATIVA');
      check((await inspect(GetBucketVersioningCommand, 'VERSIONAMENTO', signal)).Status === 'Enabled', 'NSDOCS_STORAGE_VERSIONAMENTO_AUSENTE');
    },
    async put(doc, body, signal) {
      check(Buffer.isBuffer(body) && body.length <= MAX_XML_BYTES, 'NSDOCS_XML_LIMITE');
      const hash = sha256(body);
      const key = `${config.prefix}/${doc.company_cnpj}/nfe/${doc.access_key}/${hash}.xml`;
      check(/^\d{14}$/.test(doc.company_cnpj) && /^\d{44}$/.test(doc.access_key), 'NSDOCS_STORAGE_CHAVE_INVALIDA');
      try {
        await send(PutObjectCommand, { Key: key, Body: body, ContentType: 'application/xml',
          ServerSideEncryption: 'AES256', IfNoneMatch: '*', ChecksumSHA256: Buffer.from(hash, 'hex').toString('base64'),
          Metadata: { sha256: hash, source: 'nsdocs-v2-historical-prod' } }, signal);
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 412) throw error;
        // Nao confiar apenas em metadados: conferir bytes do objeto preexistente.
        const existing = await send(GetObjectCommand, { Key: key }, signal);
        let length = 0; const chunks = [];
        try {
          for await (const chunk of existing.Body) {
            length += chunk.length;
            check(length <= MAX_XML_BYTES, 'NSDOCS_STORAGE_OBJETO_DIVERGENTE');
            chunks.push(Buffer.from(chunk));
          }
        } finally { existing.Body?.destroy?.(); }
        check(sha256(Buffer.concat(chunks)) === hash, 'NSDOCS_STORAGE_OBJETO_DIVERGENTE');
      }
      return { bucket: config.bucket, key, hash };
    },
    close() { client.destroy?.(); }
  };
}
module.exports = { storageConfig, createStorage };
