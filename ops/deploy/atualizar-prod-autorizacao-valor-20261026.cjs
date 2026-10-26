'use strict';
// Autorizacao parcial: duas colunas JSON aditivas, sem backfill financeiro.
// Backend antes do frontend. Preserva DEV, Nodes, ambientes e carga NSDOCS pausada.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='920f639c33ea3b7e8b6a1b9564862cd2bd8fd6e3',OLD='7e6cf469a753e0372c07aa43e7cb35fb8dba609d';
const PATCH_BASE='c405f80524a5b9907fe6db7dfae37d476ddb72cc';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const MANIFEST='ops/deploy/autorizacao-valor-prod-20261026.manifest.json',STATE=ROOT+'/.git/fluxy-autorizacao-valor-prod-20261026';
const PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const SOURCE_ID='8e0a4179-506a-4670-88a2-d9079728e263',COMPLEMENT_ID='c456781c-4393-468b-858f-dbf220d8f215';
const PLAN=PRIVATE+'/historical-'+SOURCE_ID+'.json',COMPLEMENT=PRIVATE+'/complement-'+COMPLEMENT_ID+'.json';
const FILES=[
 "backend/migrations/202610260001_pagamento_autorizacao_valor.js",
 "backend/scripts/autorizacaoValorProdSchema.js",
 "backend/scripts/validarAutorizacaoSelecao.js",
 "backend/scripts/validarAutorizacaoValorParcial.js",
 "backend/scripts/validarAutorizacaoValorProdSchema.js",
 "backend/scripts/validarAutorizacaoValorSchema.js",
 "backend/scripts/validarCartaoOpcionalSolicitacao.js",
 "backend/scripts/validarFilaBaixaComposta.js",
 "backend/scripts/validarFilaBaixaEstorno.js",
 "backend/scripts/validarFilaComprovantePendente.js",
 "backend/scripts/validarFilaJurosMulta.js",
 "backend/scripts/validarFilaPaginacao.js",
 "backend/scripts/validarFilaValorParcial.js",
 "backend/scripts/validarPainelAutorizacoesSqlLocal.js",
 "backend/src/models/PagamentoAutorizacaoItem.js",
 "backend/src/models/PagamentoManualFilaItem.js",
 "backend/src/services/filaBaixaCompostaService.js",
 "backend/src/services/pagamentoAutorizacaoConsultaService.js",
 "backend/src/services/pagamentoAutorizacaoSelecaoService.js",
 "backend/src/services/pagamentoAutorizacaoService.js",
 "backend/src/services/pagamentoAutorizacaoValorDomain.js",
 "backend/src/services/pagamentoFilaSaldoService.js",
 "backend/src/services/pagamentoManualFilaService.js"
];
const QA=['validarAnaliseProprietario.js','validarAutorizacaoValorSchema.js','validarAutorizacaoValorProdSchema.js','validarFilaBaixaEstorno.js','validarFilaBaixaComposta.js','validarFilaJurosMulta.js','validarFilaLiquidacaoRateada.js','validarFilaComprovantePendente.js','validarFilaEstornoPermissao.js','validarFilaPaginacao.js','validarPainelAutorizacoes.js','validarPainelAutorizacoesSqlLocal.js','validarVinculosNfePedidos.js','validarFiscalS3RoleProd.js','validarPedidoCompraFinanceiroGeo.js','auditarPermissoesGranulares.js'];
const EXTRA=['ops/deploy/atualizar-prod-autorizacao-valor-20261026.cjs','ops/deploy/atualizar-prod-autorizacao-valor-20261026.test.cjs','ops/deploy/README-autorizacao-valor-prod-20261026.md','docs/handoffs/2026-10-26-autorizacao-valor-promocao-main.md','docs/workspace/OWNERSHIP_ATIVO.md'];
const FIX_FILES=['backend/scripts/autorizacaoValorProdSchema.js','backend/scripts/validarAutorizacaoValorProdSchema.js',...EXTRA,MANIFEST];
const check=(v,c)=>{if(!v)throw Error(c);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,opts={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});
  if(r.error||r.status!==0){const safe=String(r.stderr||'').split(/\r?\n/).find(l=>/^VALOR_PROD_[A-Z0-9_]+$/.test(l));throw Error(safe||'VALOR_PROD_COMANDO_FALHOU');}
  return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function clean(e){const v={...e};for(const k of Object.keys(v))if(k.startsWith('CONFIRM_')||['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'].includes(k))delete v[k];return v;}
function procEnv(pid){return clean(Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})));}
function list(){const pid=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'VALOR_PROD_DAEMON_DIFERENTE');
  return JSON.parse(run(DAEMON,[CLI,'jlist'],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}}));}
function automaticOff(...sources){for(const source of sources)for(const key of ['NSDOCS_V2_ENABLED','NSDOCS_V2_FIXTURES_ENABLED']){
 const value=source?.[key];check(value===undefined||value===false||value===''||String(value).toLowerCase()==='false','VALOR_PROD_AUTOMATICO_LIGADO');}}
function progress(){
 privateStat(COMPLEMENT);const core=require(BACKEND+'/src/modules/fiscal/services/nsdocsHistorical/manual/complement/plan');
 const plan=core.validate(require(BACKEND+'/src/modules/fiscal/services/nsdocsHistorical/manual/complement/store').load(COMPLEMENT_ID),{id:1,cnpj:'27123008000100'});
 const summary=core.summary(plan);
 check(summary.plan_id===COMPLEMENT_ID&&summary.source_plan_id===SOURCE_ID&&summary.company_id===1&&summary.source_documents===46&&summary.documents_discovered===3529&&summary.enumeration_complete===true&&summary.source_documents_missing===0&&summary.completed_batches>=361&&summary.pending_batches===706-summary.completed_batches,'VALOR_PROD_PROGRESSO_DIVERGENTE');
 return {plan,summary};
}
function snapshot(onlineProd=true){const ps=list();check(ps.length===3,'VALOR_PROD_PROCESSOS_DIFERENTES');
  const expected=[['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],
    ['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
  const apps=expected.map(([name,cwd,node])=>{const a=ps.filter(p=>p.name===name);check(a.length===1,'VALOR_PROD_PROCESSO_NAO_UNICO');const p=a[0],e=p.pm2_env;
    const online=e.status==='online'&&p.pid>1;
    check(Number.isSafeInteger(p.pm_id)&&e.pm_cwd===cwd&&e.exec_interpreter===node
      &&(online?fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd:!onlineProd&&name==='backend-solicitacoes'),'VALOR_PROD_APP_OU_NODE_DIFERENTE');
    if(name==='backend-solicitacoes')automaticOff(e,e.env,require(BACKEND+'/node_modules/dotenv').parse(fs.readFileSync(BACKEND+'/.env')));
    if(name==='backend-solicitacoes')check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length),'VALOR_PROD_CONFIG_DIFERENTE');
    const keys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
    const upper=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&v!==undefined));
    const policy={config:Object.fromEntries(keys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e),nested:upper(e.env)};
    return{name,id:p.pm_id,pid:p.pid,restarts:Number(e.restart_time||0),env:online?hash(canonical(upper(procEnv(p.pid)))):null,envFile:hash(fs.readFileSync(cwd+'/.env')),node,policy:hash(canonical(policy))};});
  const files=['/usr/bin/node',DAEMON,...expected.map(a=>a[2]),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'];
  const persisted=files.map(f=>{const s=fs.lstatSync(f);check(s.isFile()&&!s.isSymbolicLink(),'VALOR_PROD_ARQUIVO_NAO_REGULAR');return[f,hash(fs.readFileSync(f)),s.mode,s.uid];});
  return{apps,persisted,daemon:fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8')};}
function same(before,after,allowProdRestart=false){check(canonical(before.persisted)===canonical(after.persisted)&&before.daemon===after.daemon,'VALOR_PROD_PERSISTENCIA_OU_DAEMON_MUDOU');
  for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'VALOR_PROD_APP_AUSENTE');const old={...a},next={...b};
    if(allowProdRestart&&a.name==='backend-solicitacoes'){check(next.restarts>=old.restarts&&next.restarts<=old.restarts+1,'VALOR_PROD_RESTART_EXTRA');delete old.pid;delete next.pid;delete old.restarts;delete next.restarts;if(next.env===null){delete old.env;delete next.env;}}check(canonical(old)===canonical(next),'VALOR_PROD_APP_OU_AMBIENTE_MUDOU');}}
function privateStat(file,directory=false){const s=fs.lstatSync(file);
 check(!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===(directory?0o700:0o600)
  &&(directory?s.isDirectory():s.isFile()&&s.nlink===1),'VALOR_PROD_ARQUIVO_PRIVADO_INVALIDO');return s;}
function dataSnapshot(){privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'VALOR_PROD_DIRETORIO_DIVERGENTE');
 const files=[PLAN,COMPLEMENT,PRIVATE+'/history.jsonl',PRIVATE+'/credentials.json'];
 let pointer;try{pointer=JSON.parse(fs.readFileSync(COMPLEMENT,'utf8'));}catch{throw Error('VALOR_PROD_PROGRESSO_MUDOU');}
 if(pointer.format==='manifest-progress-v1'){
  check(pointer.id===COMPLEMENT_ID&&/^[0-9a-f-]{36}$/.test(pointer.manifest_id||''),'VALOR_PROD_MANIFESTO_DIVERGENTE');
  files.push(PRIVATE+'/complement-'+COMPLEMENT_ID+'-'+pointer.manifest_id+'.manifest.json');
 }
 return files.map(file=>{privateStat(file);return [file,hash(fs.readFileSync(file))];});}
function withLocks(action){return(async()=>{
 const held=[];let folder=false;
 try{
  fs.mkdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock',{mode:0o700});folder=true;
  privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'VALOR_PROD_DIRETORIO_DIVERGENTE');
  for(const file of [PRIVATE+'/historical-plan.lock',PRIVATE+'/query.lock',PRIVATE+'/executor-captura-'+COMPLEMENT_ID+'.lock']){
   const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   held.push({fd,file});fs.writeFileSync(fd,String(process.pid));
  }
  for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){let cmd;try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{continue;}
   check(!(/nsdocsProdComplement\.js/.test(cmd)&&/--capturar|--descobrir/.test(cmd)||/nsdocsProdCapture\.js/.test(cmd)&&/--executar-plano|--capturar/.test(cmd)||/executor-captura-/.test(cmd)&&/--executar-carga-autorizada/.test(cmd)),'VALOR_PROD_CAPTURA_ATIVA');}
  return await action();
 }finally{
  for(const {fd,file} of held.reverse()){const s=fs.fstatSync(fd);fs.closeSync(fd);
   const live=fs.lstatSync(file);check(live.ino===s.ino&&live.dev===s.dev,'VALOR_PROD_LOCK_MUDOU');fs.unlinkSync(file);}
  if(folder)fs.rmdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock');
 }
})();}
function inventory(m,names,read,oldRead){
 check(m.base===BASE&&m.migration==='202610260001_pagamento_autorizacao_valor.js'&&m.additive_only===true,'VALOR_PROD_MANIFESTO_DIVERGENTE');
 check(canonical(m.files.map(f=>f.path))===canonical(FILES)&&canonical(m.extra.map(f=>f.path))===canonical(EXTRA),'VALOR_PROD_ESCOPO_DIVERGENTE');
 check(canonical([...names].sort())===canonical([...FILES,...EXTRA,MANIFEST].sort()),'VALOR_PROD_ARQUIVOS_EXTRAS');
 for(const f of [...m.files,...m.extra])check(hash(read(f.path))===f.sha256,'VALOR_PROD_HASH_DIVERGENTE');
 for(const f of m.files){const old=oldRead(f.path);check((old===null?null:hash(old))===f.old_sha256,'VALOR_PROD_BASE_HASH_DIVERGENTE');}
}
function blob(ref,file){const exists=git(['ls-tree',ref,'--',file]);return exists?run('/usr/bin/git',['show',ref+':'+file],{encoding:null}):null;}
function verify(version){
 check(/^[a-f0-9]{40}$/.test(version||''),'VALOR_PROD_SHA_INVALIDO');
 git(['fetch','origin','main']);const parent=git(['rev-parse',version+'^']);check(git(['rev-parse','origin/main'])===version&&[BASE,PATCH_BASE].includes(parent),'VALOR_PROD_MAIN_OU_BASE_DIVERGENTE');
 const read=p=>{const b=blob(version,p);check(b!==null,'VALOR_PROD_ARQUIVO_AUSENTE');return b;},m=JSON.parse(read(MANIFEST));
 inventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read,p=>blob(BASE,p));
 if(parent===PATCH_BASE)repairInventory(git(['diff','--name-only',PATCH_BASE,version]).split(/\r?\n/).filter(Boolean),JSON.parse(blob(PATCH_BASE,MANIFEST)),m);
 check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'VALOR_PROD_EXCLUSAO_NEGADA');return m;
}
function repairInventory(changed,old,next){
 check(changed.length>0&&changed.every(p=>FIX_FILES.includes(p)),'VALOR_PROD_CORRECAO_FORA_DO_ESCOPO');
 check(canonical(old.files.map(f=>f.path))===canonical(next.files.map(f=>f.path)),'VALOR_PROD_CORRECAO_ESCOPO_DIVERGENTE');
 for(const f of next.files){const prior=old.files.find(p=>p.path===f.path);check(prior.old_sha256===f.old_sha256&&(FIX_FILES.includes(f.path)||prior.sha256===f.sha256),'VALOR_PROD_CORRECAO_RUNTIME_DIVERGENTE');}
}
function repairedState(s,version,manifest){
 check(['arquivos_prontos','corrigindo_preflight'].includes(s.phase)&&[PATCH_BASE,version].includes(s.version)&&(s.version===PATCH_BASE||s.correction?.from===PATCH_BASE&&s.correction?.to===version),'VALOR_PROD_CORRECAO_ESTADO_INVALIDO');
 check(!s.correction||s.correction.to===version,'VALOR_PROD_CORRECAO_ALVO_DIVERGENTE');
 repairInventory(['backend/scripts/autorizacaoValorProdSchema.js'],{files:s.files},manifest);
 return{...s,version,correction:{from:PATCH_BASE,to:version},phase:'arquivos_prontos',files:manifest.files.map(f=>({...s.files.find(p=>p.path===f.path),...f}))};
}
function atomic(file,bytes,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes,{mode,flag:'wx',flush:true});fs.renameSync(tmp,file);}
function state(){privateStat(STATE,true);privateStat(STATE+'/estado.json');return JSON.parse(fs.readFileSync(STATE+'/estado.json','utf8'));}
function save(s,phase){s.phase=phase;atomic(STATE+'/estado.json',JSON.stringify(s));}
function sourceCheck(s,old=false){for(const f of s.files){const file=ROOT+'/'+f.path,wanted=old?f.old_sha256:f.sha256;
 check(wanted===null?!fs.existsSync(file):fs.existsSync(file)&&hash(fs.readFileSync(file))===wanted,'VALOR_PROD_FONTE_DIVERGENTE');}}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:3000},res=>{
 let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});res.on('error',()=>resolve(false));});req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
function confirmations(env=process.env){check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_AUTORIZACAO_VALOR_PROD'].every(k=>env[k]==='SIM'),'VALOR_PROD_CONFIRME_BACKUP_TIMER_JANELA');}
function restartNeeded(before,current){
 check(current.restarts>=before.restarts&&current.restarts<=before.restarts+1,'VALOR_PROD_RESTART_EXTRA');
 if(current.pid===before.pid&&current.restarts===before.restarts)return true;
 check(current.restarts===before.restarts+1,'VALOR_PROD_RESTART_DIVERGENTE');return false;
}
async function restart(s){
 const now=snapshot(false);same(s.protected,now,true);const initial=s.protected.apps.find(a=>a.name==='backend-solicitacoes'),current=now.apps.find(a=>a.name===initial.name);
 if(restartNeeded(initial,current)){
  console.log('Reiniciando SOMENTE backend-solicitacoes; Node24.22.1 e ambiente preservados.');
  run(DAEMON,[CLI,'restart',String(initial.id)],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}});
 }
 let good=0,last=0;
 for(let i=0;i<25;i++){
  const current=snapshot(false);same(s.protected,current,true);const p=current.apps.find(a=>a.name===initial.name);
  good=p.pid>1&&p.pid!==initial.pid&&p.restarts===initial.restarts+1&&await health()?p.pid===last?good+1:1:0;last=p.pid;
  if(good>=5)return;await new Promise(r=>setTimeout(r,2000));
 }
 throw Error('VALOR_PROD_BACKEND_NAO_ESTABILIZOU');
}
function doctor(s,apply=false){
 const prod=list().find(p=>p.name==='backend-solicitacoes');check(prod?.pid>1,'VALOR_PROD_BACKEND_INDISPONIVEL');
 const env={...procEnv(prod.pid),PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C'};
 check(env.ALLOW_SCHEMA_MIGRATIONS!=='true'&&!env.NODE_OPTIONS&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','VALOR_PROD_AMBIENTE_INSEGURO');
 if(apply)Object.assign(env,{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_AUTORIZACAO_VALOR_PROD_SCHEMA:'SIM'});
 const result=run(NODE,['scripts/autorizacaoValorProdSchema.js',apply?'--aplicar':'--conferir'],{cwd:BACKEND,env,timeout:90000});
 const json=result.split(/\r?\n/).findLast(l=>l.startsWith('{'));check(json,'VALOR_PROD_SCHEMA_SEM_RETORNO');const r=JSON.parse(json);
 check(r.outcome==='AUTORIZACAO_VALOR_SCHEMA_PROD'&&r.applied&&r.structure_ok&&r.pending.length===0&&r.financial_data_writes===0,'VALOR_PROD_SCHEMA_INCOMPLETO');return r;
}
function qa(){
 const guard="for(const [n,methods] of [['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])for(const m of methods)require(n)[m]=()=>{throw Error('REDE_PROIBIDA_QA');};const file=process.argv[1];process.argv=[process.execPath,file,...process.argv.slice(2)];require(file);";
 for(const file of QA){run(NODE,['-e',guard,'./scripts/'+file],{cwd:BACKEND,env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C',NODE_ENV:'test'},timeout:120000});console.log('QA aprovado: '+file);}
 run(NODE,['--test','ops/deploy/atualizar-prod-autorizacao-valor-20261026.test.cjs'],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C',NODE_ENV:'test'},timeout:30000});
 console.log('QA aprovado: aplicador PROD');
}
function protectedCheck(s,allowRestart=false){same(s.protected,snapshot(!allowRestart),allowRestart);check(canonical(s.data)===canonical(dataSnapshot()),'VALOR_PROD_PLANO_HISTORICO_OU_CREDENCIAL_MUDOU');}
function report(s){console.log(JSON.stringify({outcome:'AUTORIZACAO_VALOR_BACKEND_PROD_PRONTO',phase:s.phase,commit:s.version,migration:'202610260001_pagamento_autorizacao_valor.js',node:NODE,
 somente_duas_colunas_json_novas:true,financial_data_writes:0,external_calls:0,automatico_nsdocs_desligado:true,dev_experience_daemon_nodes_env_dumps_preservados:true,plano_historico_xmls_preservados:true,frontend_liberado:false}));}
async function main(action,version){
 check(['preparar','corrigir-preflight','aplicar','conferir'].includes(action),'VALOR_PROD_ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'&&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&process.env.ALLOW_SCHEMA_MIGRATIONS!=='true','VALOR_PROD_CONTEXTO_INVALIDO');
 check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','VALOR_PROD_GIT_INVALIDO');
 if(action==='conferir'){
  const s=state();check(s.phase==='aplicado'&&git(['rev-parse','HEAD'])===s.version&&!git(['status','--porcelain','--untracked-files=no']),'VALOR_PROD_APLICACAO_INCOMPLETA');
  sourceCheck(s);protectedCheck(s,true);doctor(s);check(await health(),'VALOR_PROD_HEALTH_FALHOU');progress();report(s);return;
 }
 return withLocks(async()=>{
  if(action==='corrigir-preflight'){
   const s=state(),m=verify(version),head=git(['rev-parse','HEAD']);
   check(git(['rev-parse',version+'^'])===PATCH_BASE&&[PATCH_BASE,version].includes(head)&&!git(['status','--porcelain','--untracked-files=no']),'VALOR_PROD_CORRECAO_HEAD_DIVERGENTE');
   const next=repairedState(s,version,m);protectedCheck(s);progress();check(await health(),'VALOR_PROD_HEALTH_FALHOU');
   if(head===PATCH_BASE){sourceCheck(s);s.correction=next.correction;save(s,'corrigindo_preflight');git(['merge','--ff-only',version]);}
   sourceCheck(next);protectedCheck(s);save(next,'arquivos_prontos');
   console.log(JSON.stringify({outcome:'AUTORIZACAO_VALOR_PREFLIGHT_CORRIGIDO',commit:version,phase:'arquivos_prontos',restarts:0,migrations:0,database_writes:0,env_preservado:true,dev_preservado:true}));return;
  }
  if(action==='preparar'){
   check(!fs.existsSync(STATE)&&!git(['status','--porcelain','--untracked-files=no']),'VALOR_PROD_ESTADO_OU_TRACKED_ALTERADO');
   const m=verify(version),head=git(['rev-parse','HEAD']);check([BASE,OLD].includes(head),'VALOR_PROD_HEAD_FORA_DA_BASE');git(['merge-base','--is-ancestor',head,version]);
   check(!git(['diff','--name-only',head,BASE,'--','backend']),'VALOR_PROD_BACKEND_BASE_DIVERGENTE');
   const before=snapshot(),data=dataSnapshot(),current=progress();check(await health(),'VALOR_PROD_HEALTH_FALHOU');
   const files=m.files.map(f=>{const file=ROOT+'/'+f.path,exists=fs.existsSync(file);check((exists?hash(fs.readFileSync(file)):null)===f.old_sha256,'VALOR_PROD_FONTE_BASE_DIVERGENTE');
    return{...f,old:exists?fs.readFileSync(file).toString('base64'):null,mode:exists?fs.statSync(file).mode&0o777:0o644};});
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'VALOR_PROD_PROGRESSO_MUDOU');fs.mkdirSync(STATE,{mode:0o700});
   atomic(STATE+'/complemento-antes.json',JSON.stringify(current.plan));
   const s={head,version,files,protected:before,data,progress_before:current.summary};save(s,'preparado');
   console.log('AUTORIZACAO_VALOR_PROD_PREPARADO. Backup privado de codigo/plano; banco, S3, processos, ambientes e DEV intactos.');return;
  }
  confirmations();run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);const s=state();
  check(['preparado','atualizando','arquivos_prontos','schema_pronto','reiniciando','aplicado'].includes(s.phase),'VALOR_PROD_FASE_INVALIDA');
  protectedCheck(s,['reiniciando','aplicado'].includes(s.phase));progress();
  if(s.phase==='aplicado'){sourceCheck(s);doctor(s);check(await health(),'VALOR_PROD_HEALTH_FALHOU');report(s);return;}
  if(['preparado','atualizando'].includes(s.phase)){
   const head=git(['rev-parse','HEAD']);check([s.head,s.version].includes(head)&&!git(['status','--porcelain','--untracked-files=no']),'VALOR_PROD_HEAD_OU_TRACKED_DIVERGENTE');
   verify(s.version);if(head===s.head){sourceCheck(s,true);save(s,'atualizando');git(['merge','--ff-only',s.version]);}save(s,'arquivos_prontos');
  }
  check(git(['rev-parse','HEAD'])===s.version&&!git(['status','--porcelain','--untracked-files=no']),'VALOR_PROD_HEAD_OU_TRACKED_DIVERGENTE');sourceCheck(s);
  if(s.phase==='arquivos_prontos'){
   qa();protectedCheck(s);doctor(s,true);protectedCheck(s);save(s,'schema_pronto');
  }
  if(s.phase==='schema_pronto'){doctor(s);save(s,'reiniciando');}
  if(s.phase==='reiniciando'){await restart(s);protectedCheck(s,true);doctor(s);check(await health(),'VALOR_PROD_HEALTH_FALHOU');save(s,'aplicado');}
  report(s);
 });
}
module.exports={main,inventory,hash,canonical,BASE,OLD,PATCH_BASE,FILES,EXTRA,MANIFEST,QA,automaticOff,same,restartNeeded,confirmations,repairInventory,repairedState};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{
 console.error(/^VALOR_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'VALOR_PROD_INTERROMPIDO_SEM_SEGREDOS');
 console.error('Preserve estado e locks existentes; nao force Git nem repita capturas. Envie somente esta saida.');process.exitCode=1;
});
