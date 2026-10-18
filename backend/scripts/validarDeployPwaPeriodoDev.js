'use strict';
// Sem config/env, MySQL, Redis, EC2 ou PM2 reais: todas as E/S sao simuladas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {executar,BACKEND,HOST,UUID}=require('./verificarRedisPasskeyDev');
async function testar(alterar=()=>{}) {
  const env={deploymentEnvironment:'development',port:8001,dbHost:HOST,dbName:'gestao_solicitacoes',
    paymentOwnerApprovalMode:'PILOT',redisUrl:'redis://segredo-qa',webauthnRpId:'qa.invalid',webauthnOrigins:['https://dev.qa.invalid']};
  const args={modo:'--verificar',cwd:BACKEND,env,runtimeEnv:{}};
  const processos=[{name:'backend-dev',pm2_env:{pm_exec_path:BACKEND+'/server.js',PORT:'8001',watch:false}}];
  const id={uuid:UUID,banco:'gestao_solicitacoes'},state={schema:true,ping:'PONG',info:[['getdel']],falha:false};
  alterar({args,processos,id,state});
  let queries=0,conectou=0,destruiu=0,erro=null;const comandos=[],logs=[];
  const anterior=JSON.stringify({env,args:args.runtimeEnv,processos});
  const client={isOpen:false,on:()=>{},connect:async()=>{conectou++;if(state.falha)throw Error('segredo-qa');client.isOpen=true;},
    ping:async()=>state.ping,sendCommand:async a=>{comandos.push(a);return state.info;},destroy:()=>{destruiu++;client.isOpen=false;}};
  try {await executar({...args,db:{query:async sql=>{assert(sql.startsWith('SELECT '));queries++;return [[id]];}},
    schema:{assertMigrationsUpToDate:async()=>{if(!state.schema)throw Error('Schema pendente');}},
    execFileSync:(cmd,a)=>{assert.equal(cmd,'pm2');assert.deepEqual(a,['jlist']);return JSON.stringify(processos);},
    createClient:o=>{assert.equal(o.url,env.redisUrl);assert.equal(o.socket.reconnectStrategy,false);return client;},log:m=>logs.push(m)});
  }catch(e){erro=e;}
  assert.equal(JSON.stringify({env,args:args.runtimeEnv,processos}),anterior,'Configuracoes/processos imutaveis');
  assert(![...logs,erro?.message].join(' ').includes('segredo-qa'));
  if(conectou&&!state.falha)assert.equal(destruiu,1);
  assert(comandos.every(a=>a.join(' ')==='COMMAND INFO GETDEL'));
  return {queries,conectou,erro,logs};
}
(async()=>{
  let r=await testar();assert.equal(r.erro,null);assert.equal(r.conectou,1);
  for(const mudar of [
    ({args})=>{args.cwd='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';},
    ({args})=>{args.modo='--aplicar';},({args})=>{args.env.deploymentEnvironment='production';},
    ({args})=>{args.env.port=8000;},({args})=>{args.env.dbHost='producao';},({args})=>{args.env.dbName='outro';},
    ({args})=>{args.env.paymentOwnerApprovalMode='ENFORCED';},({args})=>{args.env.redisUrl='';},
    ({args})=>{args.env.webauthnOrigins=['http://dev.qa.invalid'];},({args})=>{args.env.webauthnOrigins=['https://outro.invalid'];},
    ({processos})=>{processos[0].name='backend-solicitacoes';},({processos})=>{processos.push(processos[0]);},
    ({processos})=>{processos[0].pm2_env.watch=true;},({processos})=>{processos[0].pm2_env.PORT='8000';},
    ({processos})=>{processos[0].pm2_env.REDIS_URL='segredo-qa';},({args})=>{args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS='true';}
  ]) {r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,0);assert.equal(r.queries,0);}
  for(const mudar of [({id})=>{id.uuid='producao';},({state})=>{state.schema=false;}]) {
    r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,0);
  }
  for(const mudar of [({state})=>{state.info=[null];},({state})=>{state.ping='ERRO';},({state})=>{state.falha=true;}]) {
    r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,1);
  }
  const shell=fs.readFileSync(path.resolve(__dirname,'../../ops/deploy/atualizar-dev-pwa-periodo-20261018.sh'),'utf8');
  assert(shell.includes('git merge --ff-only'));assert(shell.includes('pm2 restart backend-dev --update-env'));
  assert(!/pm2\s+(?:restart|reload|delete|stop)\s+(?:all|backend-solicitacoes)/.test(shell));
  assert(!/node scripts\/.+ --aplicar|npm run migrate/.test(shell));
  assert(shell.indexOf('p.watch')<shell.indexOf('git merge --ff-only'));
  assert(shell.indexOf('scripts/verificarRedisPasskeyDev.js --verificar')<shell.indexOf('pm2 restart backend-dev'));
  console.log('Deploy periodo DEV: identidade/caminho/PM2/porta/watch/flags/schema, RP/origens, Redis PING/GETDEL somente por inspecao, cleanup/falhas e nenhum segredo/migration/restart PROD aprovados. E/S simuladas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
