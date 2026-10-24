'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { probe, BACKEND, TARGET, REGION, ACCOUNT } = require('./conferir-fiscal-s3-producao-20261024.cjs');
const options = { backend: BACKEND, bucket: TARGET, region: REGION, account: ACCOUNT };
test('ponto de entrada via stdin executa a guarda e recusa computador fora da EC2 PROD', () => {
  const fs = require('node:fs'), cp = require('node:child_process');
  const r = cp.spawnSync(process.execPath, ['-'], { input: fs.readFileSync(require.resolve('./conferir-fiscal-s3-producao-20261024.cjs')), encoding: 'utf8' });
  assert.equal(r.status, 1); assert(r.stderr.includes('CONFERENCIA_FISCAL_S3_INTERROMPIDA_SEM_EXIBIR_SEGREDOS'));
  assert(!r.stdout.includes('FISCAL_S3_PRODUCAO_INVENTARIO_SOMENTE_LEITURA'));
});
function fixture({ refs = 0, denied = null, uuid = true, tls = true, insecure = false, staticKey = true } = {}) {
  const calls = [], sql = [], credentials = { AWS_ACCESS_KEY_ID: 'QA_ACCESS_NAO_REAL', AWS_SECRET_ACCESS_KEY: 'QA_SECRET_NAO_REAL' };
  const initial = { DEPLOYMENT_ENV: 'production', PORT: '8000', DB_HOST: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    DB_NAME: 'gestao_solicitacoes', DB_USER: 'qa', DB_PASSWORD: 'QA_DB_SECRET', DB_SSL_CA_FILE: '/qa/ca.pem',
    FISCAL_S3_BUCKET: 'bucket-legado-qa', FISCAL_S3_REGION: 'us-east-2', ...(staticKey ? credentials : {}) };
  const columns = Object.entries({ fiscal_dfe_documents: ['xml_storage_key','pdf_storage_key','danfe_storage_key'],
    fiscal_dfe_events: ['raw_event_xml_storage_key'], fiscal_sync_logs: ['raw_request_storage_key','raw_response_storage_key'],
    fiscal_accounting_batches: ['zip_storage_key','report_storage_key'], fiscal_certificates: ['certificate_s3_key_encrypted'],
    fiscal_companies: ['empresa_id'], schema_migrations: ['name'] }).flatMap(([tabela, cols]) => cols.map(coluna => ({ tabela, coluna })));
  const connection = { async query({ sql: q, values }) {
    sql.push(q);
    if (q.includes('server_uuid')) return [[{ uuid: uuid ? '5ed4b970-009f-11f1-809c-0ad0e0c90c53' : 'DEV_UUID', banco: initial.DB_NAME }]];
    if (q.startsWith('SHOW SESSION')) return [[{ Variable_name: 'Ssl_cipher', Value: tls ? 'QA_TLS' : '' }, { Variable_name: 'Ssl_version', Value: 'TLSv1.3' }]];
    if (q.includes('information_schema.columns')) return [columns];
    if (q.includes('information_schema.STATISTICS')) return [[]];
    if (q.startsWith('SELECT COUNT')) return [[{ total: q.includes('`xml_storage_key`') ? refs : 0 }]];
    if (q.includes('FROM fiscal_companies')) { assert.deepEqual(values, ['27123008000100']); return [[{ id: 8, empresa_id: 3, uf: 'ES', ativo: 1, modulo_fiscal_habilitado: 1 }]]; }
    if (q.includes('FROM empresas_grupo')) return [[{id:3,ativo:1}]];
    if (q.startsWith('SELECT name')) return [[]];
    assert.equal(q, 'SET TRANSACTION READ ONLY'); return [[]];
  }, async beginTransaction() { calls.push('readonly-transaction'); }, async rollback() { calls.push('rollback'); }, async end() { calls.push('end'); } };
  class Handler {}
  const commands = ['GetCallerIdentityCommand','GetBucketLocationCommand','GetPublicAccessBlockCommand','GetBucketPolicyStatusCommand',
    'GetBucketOwnershipControlsCommand','GetBucketVersioningCommand','GetBucketEncryptionCommand','GetBucketPolicyCommand'];
  const api = Object.fromEntries(commands.map(name => [name, class { constructor(input) { this.name = name; this.input = input; } }]));
  class Client {
    constructor(config) { assert.equal(config.maxAttempts, 1); assert.equal(config.region, REGION); }
    async send(command) {
      assert(commands.includes(command.name)); calls.push(command.name);
      if (denied === command.name) { const e = Error('NAO_EXIBIR_SEGREDO'); e.name = 'AccessDenied'; throw e; }
      if (command.name === 'GetCallerIdentityCommand') return { Account: ACCOUNT, Arn: `arn:aws:iam::${ACCOUNT}:user/qa-fiscal` };
      assert.deepEqual(command.input, { Bucket: TARGET, ExpectedBucketOwner: ACCOUNT });
      return {
        GetBucketLocationCommand: { LocationConstraint: REGION },
        GetPublicAccessBlockCommand: { PublicAccessBlockConfiguration: { BlockPublicAcls: !insecure, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } },
        GetBucketPolicyStatusCommand: { PolicyStatus: { IsPublic: insecure } },
        GetBucketOwnershipControlsCommand: { OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } },
        GetBucketVersioningCommand: { Status: 'Enabled' },
        GetBucketEncryptionCommand: { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] } },
        GetBucketPolicyCommand: { Policy: JSON.stringify({ Statement: [{ Effect: 'Deny', Principal: '*', Action: 's3:*',
          Resource: [`arn:aws:s3:::${TARGET}`, `arn:aws:s3:::${TARGET}/*`], Condition: { Bool: { 'aws:SecureTransport': 'false' } } }] }) }
      }[command.name];
    }
    destroy() {}
  }
  const deps = { initial, read: f => f.endsWith('.env') ? 'QA_ENV' : 'QA_CA', parse: () => ({}), isFile: () => true,
    mysql: { async createConnection(config) { assert(config.ssl.verifyIdentity && config.ssl.rejectUnauthorized); assert.equal(config.multipleStatements, false); return connection; } },
    s3: { ...api, S3Client: Client }, identity: () => new Client({maxAttempts:1,region:REGION}).send(new api.GetCallerIdentityCommand({})), Handler };
  return { deps, calls, sql };
}
test('inventario consulta apenas identidade/seguranca AWS e SQL de leitura; nao imprime segredo nem libera deploy', async () => {
  const f = fixture(), r = await probe(options, f.deps);
  assert.equal(r.liberado_para_aplicar, false); assert.equal(r.permissoes_objetos_testadas, false);
  assert.equal(r.gravacoes_s3, 0); assert.equal(r.alteracoes_banco, 0);
  assert(r.bucket.transporte.deny_http_padrao_reconhecido); assert(r.bucket.acesso_publico.bloqueio_integral);
  assert(!JSON.stringify(r).includes('QA_SECRET')); assert(!JSON.stringify(r).includes('QA_DB_SECRET'));
  assert(f.sql.every(q => /^(SELECT|SHOW|SET TRANSACTION READ ONLY)/.test(q)));
  assert(f.calls.includes('rollback') && f.calls.includes('end')); assert.equal(f.calls.filter(c => c.endsWith('Command')).length, 8);
});
test('referencias existentes impedem recomendar troca direta de bucket; nao fazem GetObject', async () => {
  const f = fixture({ refs: 4 }), r = await probe(options, f.deps);
  assert.equal(r.referencias_existentes, 4); assert(r.troca_bucket_exige_reconciliacao);
  assert(r.pendencias.includes('NAO_TROCAR_BUCKET_COM_REFERENCIAS_EXISTENTES'));
  assert(!f.calls.some(c => /Put|Delete|GetObject|AssumeRole/.test(c)));
});
test('AccessDenied permanece desconhecido; bucket publico nao passa como protegido', async () => {
  const a = await probe(options, fixture({ denied: 'GetPublicAccessBlockCommand' }).deps);
  assert.equal(a.bucket.acesso_publico.lido, false); assert.equal(a.bucket.acesso_publico.erro, 'AccessDenied');
  assert(a.pendencias.includes('PROTECOES_BUCKET_EXIGEM_CONFERENCIA'));
  const b = await probe(options, fixture({ insecure: true }).deps);
  assert.equal(b.bucket.politica_publica.publica, true); assert(b.pendencias.includes('PROTECOES_BUCKET_EXIGEM_CONFERENCIA'));
});
test('UUID/TLS divergentes param antes de AWS; credencial ausente nao usa chain/IMDS', async () => {
  for (const o of [{ uuid: false }, { tls: false }]) { const f = fixture(o); await assert.rejects(probe(options, f.deps)); assert(!f.calls.some(c => c.endsWith('Command'))); assert(f.calls.includes('end')); }
  const f = fixture({ staticKey: false }), r = await probe(options, f.deps);
  assert(r.pendencias.includes('ORIGEM_CREDENCIAL_EXIGE_CONFERENCIA_ESPECIFICA'));
  assert(!f.calls.some(c => c.endsWith('Command')));
});
test('conflitos exibem apenas nomes; erro de identidade nao libera consultas S3', async () => {
  const f = fixture(); f.deps.parse = () => ({ AWS_SECRET_ACCESS_KEY: 'SEGREDO_ARQUIVO' });
  const r = await probe(options, f.deps); assert.deepEqual(r.configuracao.campos_divergentes, ['AWS_SECRET_ACCESS_KEY']);
  assert(!JSON.stringify(r).includes('SEGREDO_ARQUIVO'));
  const a = fixture({ denied: 'GetCallerIdentityCommand' }), result = await probe(options, a.deps);
  assert(result.pendencias.includes('IDENTIDADE_AWS_NAO_CONFERIDA'));
  assert.equal(a.calls.filter(c => c.endsWith('Command')).length, 1);
});
