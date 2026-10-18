'use strict';
// Runner produtivo real, MySQL/Redis/PM2/filesystem simulados; nenhuma rede.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {executar,BACKEND}=require('./verificarPwaPeriodoProducao');
const {IDENTIDADE_SQL,TLS_SQL,JSON_SQL,COLUNAS_SQL}=require('./promoverSchemaProducao20261018');
async function testar(alterar=()=>{}) {
  const vars={DB_HOST:'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',DB_NAME:'gestao_solicitacoes',
    DB_SSL_CA_FILE:'/certs/rds.pem',DEPLOYMENT_ENV:'production',PORT:'8000',JWT_EXPIRES_IN:'12h',PAYMENT_OWNER_APPROVAL_MODE:'PILOT',
    DEV_USER_SWITCH_ENABLED:'false',PRODUCTION_USER_SWITCH_ENABLED:'true',REDIS_URL:'redis://segredo-qa',
    WEBAUTHN_RP_ID:'qa.invalid',WEBAUTHN_ORIGINS:'https://prod.qa.invalid'};
  const args={modo:'--verificar',cwd:BACKEND,runtimeEnv:{...vars},env:{deploymentEnvironment:'production',port:8000,
    dbHost:vars.DB_HOST,dbName:vars.DB_NAME,dbSslCaFile:vars.DB_SSL_CA_FILE,jwtExpiresIn:'12h',paymentOwnerApprovalMode:'PILOT',
    devUserSwitchEnabled:false,productionUserSwitchEnabled:true,redisUrl:vars.REDIS_URL,redisKeyPrefix:'fluxy:',
    webauthnRpId:vars.WEBAUTHN_RP_ID,webauthnOrigins:[vars.WEBAUTHN_ORIGINS]}};
  const arquivo={...vars},processos=[{name:'backend-solicitacoes',pm2_env:{...vars,pm_exec_path:BACKEND+'/server.js',watch:false}},
    {name:'backend-dev',pm2_env:{PORT:'8001'}}];
  const state={pending:[],uuid:'5ed4b970-009f-11f1-809c-0ad0e0c90c53',tls:true,ca:true,ping:'PONG',info:[['getdel']],falha:false};
  alterar({args,arquivo,processos,state});
  let queries=0,conectou=0,destruiu=0,erro=null;const comandos=[],logs=[];
  const anterior=JSON.stringify({args,arquivo,processos});
  const client={isOpen:false,on:()=>{},connect:async()=>{conectou++;if(state.falha)throw Error('segredo-qa');client.isOpen=true;},
    ping:async()=>state.ping,sendCommand:async c=>{comandos.push(c);return state.info;},destroy:()=>{destruiu++;client.isOpen=false;}};
  try{await executar({...args,validateRequiredEnv(){},fileSystem:{readFileSync:f=>{assert.equal(f,BACKEND+'/.env');return Object.entries(arquivo).map(([k,v])=>`${k}=${v}`).join('\n');},statSync:()=>({isFile:()=>state.ca})},
    execFileSync:(cmd,a)=>{assert.equal(cmd,'pm2');assert.deepEqual(a,['jlist']);return JSON.stringify(processos);},
    db:{query:async sql=>{queries++;assert(/^(SELECT|SHOW) /.test(sql));
      if(sql===IDENTIDADE_SQL)return [[{uuid:state.uuid,banco:'gestao_solicitacoes'}]];
      if(sql===TLS_SQL)return [state.tls?[{Variable_name:'Ssl_cipher',Value:'TLS_QA'},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]:[]];
      if(sql===JSON_SQL)return [[{item_ok:7}]];assert.equal(sql,COLUNAS_SQL);
      return [[{tabela:'rh_colaboradores',coluna:'data_inicio_efetivo_obra',tipo:'date',anulavel:'YES'},
        {tabela:'titulos_financeiros',coluna:'bloqueio_pagamento_proprietario',tipo:'json',anulavel:'YES'}]];}},
    schema:{getMigrationState:async()=>({tableExists:true,pending:state.pending}),assertMigrationsUpToDate:async()=>{assert.equal(state.pending.length,0);},runMigrations:async()=>{throw Error('DDL proibido');}},
    createClient:o=>{assert.equal(o.url,args.env.redisUrl);assert.equal(o.socket.reconnectStrategy,false);return client;},log:m=>logs.push(m)});
  }catch(e){erro=e;}
  assert.equal(JSON.stringify({args,arquivo,processos}),anterior);assert(![...logs,erro?.message].join(' ').includes('segredo-qa'));
  assert(comandos.every(c=>c.join(' ')==='COMMAND INFO GETDEL'));if(conectou&&!state.falha)assert.equal(destruiu,1);
  return {erro,queries,conectou};
}
(async()=>{
  let r=await testar();assert.equal(r.erro,null);assert.equal(r.conectou,1);
  for(const mudar of [({args})=>{args.modo='--aplicar';},({args})=>{args.cwd='/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';},
    ({args})=>{args.env.deploymentEnvironment='development';},({args})=>{args.env.port=8001;},({args})=>{args.env.dbHost='fluxy-staging';},
    ({args})=>{args.env.paymentOwnerApprovalMode='ENFORCED';},({processos})=>{processos[0].name='backend-dev';},
    ({processos})=>{processos[0].pm2_env.PORT='8001';},({processos})=>{processos[0].pm2_env.watch=true;},
    ({processos})=>{processos[0].pm2_env.JWT_EXPIRES_IN='8h';},({args})=>{args.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS='true';},
    ({arquivo})=>{arquivo.DB_SSL_CA_FILE='';},({state})=>{state.ca=false;}]) {
    r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,0);assert.equal(r.queries,0);
  }
  for(const mudar of [({state})=>{state.uuid='dev';},({state})=>{state.tls=false;},
    ({state})=>{state.pending=['202610180002_bloqueio_pagamento_proprietario.js'];},({state})=>{state.pending=['nao-autorizada.js'];},
    ({arquivo})=>{arquivo.REDIS_URL='outro';},({processos})=>{processos[0].pm2_env.WEBAUTHN_RP_ID='outro';},
    ({args})=>{args.env.webauthnOrigins=['http://prod.qa.invalid'];}]) {
    r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,0);
  }
  for(const mudar of [({state})=>{state.info=[null];},({state})=>{state.ping='ERRO';},({state})=>{state.falha=true;}]) {
    r=await testar(mudar);assert(r.erro);assert.equal(r.conectou,1);
  }
  const shell=fs.readFileSync(path.resolve(__dirname,'../../ops/deploy/atualizar-producao-pwa-periodo-20261018.sh'),'utf8');
  for(const s of ['git merge --ff-only','fluxy-prod-deploy.lock','systemctl is-active --quiet fluxy-prod-db-backup.timer',
    'CONFIRM_PROD_BACKUP_TIMER','git diff --quiet 957ebf8528900904274151d3f9b3a54c9bed17dd','sha256sum backend/.env','pm2 restart backend-solicitacoes\n'])assert(shell.includes(s));
  assert(!/pm2\s+(?:restart|reload|delete|stop|save)\s+(?:all|backend-dev)/.test(shell));
  assert(!/pm2 restart backend-solicitacoes --update-env/.test(shell));
  assert(!/scripts\/.+ --aplicar|npm run migrate/.test(shell));
  assert(shell.indexOf('p.watch')<shell.indexOf('git merge --ff-only'));
  assert(shell.indexOf('scripts/verificarPwaPeriodoProducao.js --verificar')<shell.indexOf('pm2 restart backend-solicitacoes'));
  console.log('Promocao PWA/RH PRODUCAO: identidade/TLS/PM2/watch/PILOT/12h/schema, backup/timer/hashenv, ausencia DDL, Redis somente inspecao e nenhum restart DEV aprovados. E/S simuladas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
