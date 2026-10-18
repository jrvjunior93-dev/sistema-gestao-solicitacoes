'use strict';
// Operador: somente SELECT/SHOW de identidade/TLS/schema e inspecao Redis.
// Nao aplica migrations, nao consome challenges e nao cria/baixa titulos.
const fs=require('node:fs'),dotenv=require('dotenv');
const {executar:conferirBase,BACKEND}=require('./promoverSchemaProducao20261018');
async function executar(options) {
  const {modo,cwd,env,runtimeEnv=process.env,execFileSync,createClient,fileSystem=fs,log=console.log}=options;
  if(modo!=='--verificar'||cwd!==BACKEND||env.deploymentEnvironment!=='production'||Number(env.port)!==8000
    ||env.dbHost!=='gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com'||env.dbName!=='gestao_solicitacoes')throw Error('EXCLUSIVO_PRODUCAO: nenhuma verificacao executada.');
  if(env.paymentOwnerApprovalMode!=='PILOT')throw Error('PILOT produtivo nao confirmado. Este roteiro nao altera o modo.');
  // Modo constante, sem chamada a --aplicar, inclusive se houver pendencia antiga.
  await conferirBase({...options,runtimeEnv,fileSystem,modo:'--concluido'});
  const arquivo=dotenv.parse(fileSystem.readFileSync(`${BACKEND}/.env`,'utf8'));
  const processos=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>p.name==='backend-solicitacoes');
  const p=processos[0]?.pm2_env;
  if(processos.length!==1||p?.pm_exec_path!==`${BACKEND}/server.js`)throw Error('PM2 PRODUCAO alterado durante a verificacao.');
  for(const key of ['REDIS_URL','REDIS_KEY_PREFIX','WEBAUTHN_RP_ID','WEBAUTHN_ORIGINS']) {
    for(const origem of [p,arquivo])if(origem[key]!==undefined&&String(origem[key])!==String(runtimeEnv[key]??''))throw Error(`Configuracao ${key} divergente; valores nao exibidos.`);
    if(key!=='REDIS_KEY_PREFIX'&&p[key]===undefined&&arquivo[key]===undefined)throw Error(`Configuracao ${key} nao persistida no ambiente produtivo.`);
  }
  if(p.REDIS_KEY_PREFIX===undefined&&arquivo.REDIS_KEY_PREFIX===undefined&&env.redisKeyPrefix!=='fluxy:')throw Error('Prefixo Redis existe somente no terminal.');
  if(!env.redisUrl||!env.webauthnRpId||!Array.isArray(env.webauthnOrigins)||!env.webauthnOrigins.length)throw Error('Redis/passkey produtivos sem configuracao completa.');
  for(const origem of env.webauthnOrigins) {
    let u;try{u=new URL(origem);}catch{throw Error('Origem WebAuthn invalida.');}
    if(u.protocol!=='https:'||u.origin!==origem||!(u.hostname===env.webauthnRpId||u.hostname.endsWith('.'+env.webauthnRpId)))throw Error('RP/origens HTTPS produtivos incoerentes. Nada alterado.');
  }
  const client=createClient({url:env.redisUrl,socket:{connectTimeout:4000,reconnectStrategy:false}});
  client.on('error',()=>{});
  try {
    await client.connect();if(await client.ping()!=='PONG')throw Error('PING');
    const info=await client.sendCommand(['COMMAND','INFO','GETDEL']);
    if(!Array.isArray(info)||!Array.isArray(info[0])||String(info[0][0]).toLowerCase()!=='getdel')throw Error('GETDEL');
  }catch{throw Error('Redis produtivo nao confirmou PING/COMMAND INFO GETDEL. Confira suporte/conectividade/ACL de inspecao, sem alterar configuracao automaticamente.');}
  finally{if(client.isOpen)client.destroy();}
  log('PRODUCAO: Redis PING/GETDEL por inspecao e RP/origens conferidos. Nenhuma chave, passkey, configuracao, migration, titulo ou processo alterado.');
}
if(require.main===module) {
  const {env,validateRequiredEnv}=require('../src/config/env'),db=require('../src/database');
  executar({modo:process.argv[2],cwd:fs.realpathSync(process.cwd()),env,runtimeEnv:process.env,validateRequiredEnv,db,
    schema:require('../src/database/runMigrations'),execFileSync:require('node:child_process').execFileSync,createClient:require('redis').createClient})
    .catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());
}
module.exports={executar,BACKEND};
