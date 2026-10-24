'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const R = require('../src/modules/fiscal/services/fiscalProdS3Role');
const config = { bucket: 'fluxy-fiscal-prod', region: 'us-east-2', prefix: 'prod' };
const env = { DEPLOYMENT_ENV: 'production', PORT: '8000', FISCAL_S3_ROLE_ARN: R.ROLE,
  AWS_ACCESS_KEY_ID: 'QA_SOURCE', AWS_SECRET_ACCESS_KEY: 'QA_SOURCE_SECRET' };
function fixture() {
  let clock = Date.now(), fail = false, expired = false; const calls = [];
  class AssumeRoleCommand { constructor(input) { this.input = input; } }
  const client = { async send(command) { calls.push(command.input); if (fail) throw Error('SEGREDO_NAO_EXIBIR');
    await Promise.resolve(); return { AssumedRoleUser: { Arn: R.ROLE_USER }, Credentials: { AccessKeyId: 'QA_TEMP', SecretAccessKey: 'QA_TEMP_SECRET', SessionToken: 'QA_TOKEN', Expiration: new Date(clock + (expired ? 1000 : 3600000)) } }; }, destroy() {} };
  return { calls, deps: { cwd: R.CWD, sdk: { AssumeRoleCommand }, client, clock: () => clock },
    advance(ms) { clock += ms; }, fail(v) { fail = v; }, expired(v) { expired = v; } };
}
test('configuracao exige PROD/caminho/bucket/prefixo/role exatos, nunca role DEV ou origem vazia', () => {
  const f = fixture();
  for (const [c, e, d] of [[{...config,bucket:'fluxy-fiscal-dev'},env,f.deps], [config,{...env,DEPLOYMENT_ENV:'development'},f.deps],
    [config,{...env,FISCAL_S3_ROLE_ARN:R.ROLE+'DEV'},f.deps], [config,env,{...f.deps,cwd:'/tmp'}],
    [{...config,prefix:'dev'},env,f.deps], [config,{...env,AWS_SECRET_ACCESS_KEY:''},f.deps]])
    assert.throws(() => R.createCredentialsProvider(c,e,d));
  assert.equal(f.calls.length, 0);
});
test('sessao limitada por policy, concorrencia unica, cache e refresh antes de expirar links900s', async () => {
  const f = fixture(), before = JSON.stringify(env), provider = R.createCredentialsProvider(config,env,f.deps);
  const [a,b] = await Promise.all([provider(),provider()]); assert.equal(f.calls.length, 1); assert.equal(a,b); assert.notEqual(a.accessKeyId, env.AWS_ACCESS_KEY_ID);
  assert.equal(f.calls[0].RoleArn,R.ROLE); assert.equal(f.calls[0].DurationSeconds,3600); assert.deepEqual(JSON.parse(f.calls[0].Policy),R.POLICY);
  await provider(); assert.equal(f.calls.length,1); f.advance(2700001); await provider(); assert.equal(f.calls.length,2);
  assert.equal(JSON.stringify(env),before);
  assert(R.POLICY.Statement.every(s => !JSON.stringify(s).includes('fluxy-fiscal-dev') && !JSON.stringify(s).includes('s3:Delete')));
});
test('STS recusado ou expiracao invalida falha sem fallback/origem/segredos; retry pode recuperar', async () => {
  const f = fixture(), provider = R.createCredentialsProvider(config,env,f.deps); f.fail(true);
  await assert.rejects(provider(),e => e.code==='FISCAL_S3_PROD_ASSUME_ROLE_RECUSADO' && !e.message.includes('SEGREDO_NAO_EXIBIR'));
  f.fail(false); f.expired(true); await assert.rejects(provider(),e=>e.code==='FISCAL_S3_PROD_SESSAO_INVALIDA');
  f.expired(false); assert.equal((await provider()).accessKeyId,'QA_TEMP'); assert.equal(f.calls.length,3);
});
test('cliente fiscal usa role somente no opt-in; clientes legados/DEV conservam origem anterior', async () => {
  const f = fixture(), clients = [], commands = []; let activeEnv = {...env,FISCAL_S3_BUCKET:config.bucket,FISCAL_S3_REGION:config.region,FISCAL_S3_PREFIX:config.prefix};
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/modules/fiscal/services/fiscalS3Service.js'),'utf8'),{
    module:mod,Buffer,process:{get env(){return activeEnv;}},require:name=>{
      if(name==='@aws-sdk/client-s3')return { S3Client:class{constructor(c){this.config=c;clients.push(c);}},GetObjectCommand:class{constructor(i){this.input=i;commands.push(i);}} };
      if(name==='@aws-sdk/s3-request-presigner')return {getSignedUrl:async(client)=>{if(typeof client.config.credentials==='function')await client.config.credentials();return'https://qa.local/xml';}};
      if(name==='./fiscalProdS3Role')return {createCredentialsProvider:c=>R.createCredentialsProvider(c,activeEnv,f.deps)};
      if(name==='../../../utils/fileName')return{attachmentContentDisposition:()=> 'attachment; filename="nfe.xml"'};
      return require(name);
    }
  });
  await mod.exports.getFiscalObjectSignedUrl('prod/27123008000100/nfe/qa/original.xml',180,{attachment:true,filename:'nfe.xml'});
  assert.equal(typeof clients[0].credentials,'function');assert.equal(clients[0].endpoint,'https://s3.us-east-2.amazonaws.com');
  assert.equal(commands[0].Bucket,config.bucket);assert.equal(commands[0].ResponseContentDisposition,'attachment; filename="nfe.xml"');
  activeEnv={...activeEnv,FISCAL_S3_ROLE_ARN:undefined};
  await mod.exports.getFiscalObjectSignedUrl('dev/qa.xml',180);
  assert.equal(clients[1].credentials.accessKeyId,env.AWS_ACCESS_KEY_ID);assert.equal(clients[1].endpoint,undefined);assert.equal(f.calls.length,1);
});
test('contrato do SDK instalado possui AssumeRole real; nenhuma dependencia nova resolvida em rede',()=>{
  const sdk=require('@aws-sdk/nested-clients/sts');assert.equal(typeof sdk.STSClient,'function');
  const command=new sdk.AssumeRoleCommand({RoleArn:R.ROLE});assert.equal(command.input.RoleArn,R.ROLE);
});
