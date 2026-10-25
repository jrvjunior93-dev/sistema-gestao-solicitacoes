'use strict';
// Patch da CLI: dois decodificadores. Sem migration, restart, carga real ou
// alteracao de plano, credencial, .env, S3/IAM, dumps, frontend ou Node.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='b1683b6d3148d68ffe34f90b00d7a620ab5363ab',OLD='0b1909293720731d99990bb3b55a96433b6cfd15';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const MANIFEST='ops/deploy/nsdocs-codec-prod-20261024.manifest.json',STATE=ROOT+'/.git/fluxy-nsdocs-codec-prod-20261024';
const PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const PLAN=PRIVATE+'/historical-8e0a4179-506a-4670-88a2-d9079728e263.json';
const FILES=['backend/src/modules/fiscal/services/nsdocsHistorical/normalize.js','backend/src/modules/fiscal/services/nsdocsHistorical/manual/transport.js'];
const QA='backend/scripts/validarNsdocsCompactacaoProd.js';
const check=(v,c)=>{if(!v)throw Error(c);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,opts={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});
  check(!r.error&&r.status===0,'NSDOCS_CODEC_PROD_COMANDO_FALHOU');return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function clean(e){const v={...e};for(const k of Object.keys(v))if(k.startsWith('CONFIRM_')||['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID','ALLOW_SCHEMA_MIGRATIONS'].includes(k))delete v[k];return v;}
function procEnv(pid){return clean(Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})));}
function list(){const pid=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'NSDOCS_CODEC_PROD_DAEMON_DIFERENTE');
  return JSON.parse(run(DAEMON,[CLI,'jlist'],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}}));}
function snapshot(onlineProd=true){const ps=list();check(ps.length===3,'NSDOCS_CODEC_PROD_PROCESSOS_DIFERENTES');
  const expected=[['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],
    ['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
  const apps=expected.map(([name,cwd,node])=>{const a=ps.filter(p=>p.name===name);check(a.length===1,'NSDOCS_CODEC_PROD_PROCESSO_NAO_UNICO');const p=a[0],e=p.pm2_env;
    const online=e.status==='online'&&p.pid>1;
    check(Number.isSafeInteger(p.pm_id)&&e.pm_cwd===cwd&&e.exec_interpreter===node
      &&(online?fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd:!onlineProd&&name==='backend-solicitacoes'),'NSDOCS_CODEC_PROD_APP_OU_NODE_DIFERENTE');
    if(name==='backend-solicitacoes')check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length),'NSDOCS_CODEC_PROD_CONFIG_DIFERENTE');
    const keys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
    const upper=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&v!==undefined));
    const policy={config:Object.fromEntries(keys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e),nested:upper(e.env)};
    return{name,id:p.pm_id,pid:p.pid,env:online?hash(canonical(upper(procEnv(p.pid)))):null,envFile:hash(fs.readFileSync(cwd+'/.env')),node,policy:hash(canonical(policy))};});
  const files=['/usr/bin/node',DAEMON,...expected.map(a=>a[2]),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'];
  const persisted=files.map(f=>{const s=fs.lstatSync(f);check(s.isFile()&&!s.isSymbolicLink(),'NSDOCS_CODEC_PROD_ARQUIVO_NAO_REGULAR');return[f,hash(fs.readFileSync(f)),s.mode,s.uid];});
  return{apps,persisted,daemon:fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8')};}
function same(before,after,allowProdRestart=false){check(canonical(before.persisted)===canonical(after.persisted)&&before.daemon===after.daemon,'NSDOCS_CODEC_PROD_PERSISTENCIA_OU_DAEMON_MUDOU');
  for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'NSDOCS_CODEC_PROD_APP_AUSENTE');const old={...a},next={...b};
    if(allowProdRestart&&a.name==='backend-solicitacoes'){delete old.pid;delete next.pid;if(next.env===null){delete old.env;delete next.env;}}check(canonical(old)===canonical(next),'NSDOCS_CODEC_PROD_APP_OU_AMBIENTE_MUDOU');}}
function privateStat(file,directory=false){const s=fs.lstatSync(file);
 check(!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===(directory?0o700:0o600)
  &&(directory?s.isDirectory():s.isFile()&&s.nlink===1),'NSDOCS_CODEC_PROD_ARQUIVO_PRIVADO_INVALIDO');return s;}
function dataSnapshot(){privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'NSDOCS_CODEC_PROD_DIRETORIO_DIVERGENTE');
 privateStat(PLAN);privateStat(PRIVATE+'/history.jsonl');return {plan:hash(fs.readFileSync(PLAN)),journal:hash(fs.readFileSync(PRIVATE+'/history.jsonl'))};}
function withLocks(action){return(async()=>{
 const held=[];let folder=false;
 try{
  fs.mkdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock',{mode:0o700});folder=true;
  privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'NSDOCS_CODEC_PROD_DIRETORIO_DIVERGENTE');
  for(const file of [PRIVATE+'/historical-plan.lock',PRIVATE+'/query.lock']){
   const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   held.push({fd,file});fs.writeFileSync(fd,String(process.pid));
  }
  return await action();
 }finally{
  for(const {fd,file} of held.reverse()){const s=fs.fstatSync(fd);fs.closeSync(fd);
   const live=fs.lstatSync(file);check(live.ino===s.ino&&live.dev===s.dev,'NSDOCS_CODEC_PROD_LOCK_MUDOU');fs.unlinkSync(file);}
  if(folder)fs.rmdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock');
 }
})();}
function inventory(m,names,read,oldRead=p=>run('/usr/bin/git',['show',BASE+':'+p],{encoding:null})){
 check(m.base===BASE&&m.no_restart===true&&m.no_schema===true,'NSDOCS_CODEC_PROD_MANIFESTO_DIVERGENTE');
 check(canonical(m.files.map(f=>f.path))===canonical(FILES)&&m.qa.length===1&&m.qa[0].path===QA,'NSDOCS_CODEC_PROD_ESCOPO_DIVERGENTE');
 check(canonical(names.filter(p=>p.startsWith('backend/')).sort())===canonical([...FILES,QA].sort()),'NSDOCS_CODEC_PROD_BACKEND_EXTRA');
 check(names.every(p=>p.startsWith('backend/')||p.startsWith('ops/deploy/')||p.startsWith('docs/')),'NSDOCS_CODEC_PROD_FRONTEND_OU_RAIZ');
 for(const f of [...m.files,...m.qa])check(hash(read(f.path))===f.sha256,'NSDOCS_CODEC_PROD_HASH_DIVERGENTE');
 for(const f of m.files)check(hash(oldRead(f.path))===f.old_sha256,'NSDOCS_CODEC_PROD_BASE_HASH_DIVERGENTE');
}
function verify(version){check(/^[a-f0-9]{40}$/.test(version||''),'NSDOCS_CODEC_PROD_SHA_INVALIDO');
 git(['fetch','origin','main']);check(git(['rev-parse','origin/main'])===version,'NSDOCS_CODEC_PROD_MAIN_DIVERGENTE');
 const read=p=>run('/usr/bin/git',['show',version+':'+p],{encoding:null}),m=JSON.parse(read(MANIFEST));
 inventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read);
 check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'NSDOCS_CODEC_PROD_EXCLUSAO_NEGADA');return m;
}
function atomic(file,bytes,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();
 fs.writeFileSync(tmp,bytes,{mode,flag:'wx',flush:true});fs.renameSync(tmp,file);}
function state(){const file=STATE+'/estado.json';privateStat(file);return JSON.parse(fs.readFileSync(file,'utf8'));}
function sourceCheck(s,returned=false){for(const f of s.files)check(hash(fs.readFileSync(ROOT+'/'+f.path))===(returned?f.old_sha256:f.sha256),'NSDOCS_CODEC_PROD_FONTE_DIVERGENTE');}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:3000},res=>{
 let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});res.on('error',()=>resolve(false));});
 req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
async function main(action,version){
 check(['preparar','aplicar','conferir','voltar'].includes(action),'NSDOCS_CODEC_PROD_ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
  &&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS,'NSDOCS_CODEC_PROD_CONTEXTO_INVALIDO');
 check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','NSDOCS_CODEC_PROD_GIT_INVALIDO');
 if(action==='conferir'){
  const s=state();same(s.protected,snapshot());sourceCheck(s,['preparado','retornado'].includes(s.phase));
  check(git(['rev-parse','HEAD'])===(s.phase==='preparado'?s.head:s.version),'NSDOCS_CODEC_PROD_HEAD_DIVERGENTE');
  console.log(JSON.stringify({outcome:'NSDOCS_CODEC_PROD_CONFERIDO',phase:s.phase,sem_reinicio:true,processos_nodes_env_dumps_preservados:true}));return;
 }
 return withLocks(async()=>{
  const before=snapshot(),data=dataSnapshot();check(await health(),'NSDOCS_CODEC_PROD_HEALTH_FALHOU');
  if(action==='preparar'){
   check(!fs.existsSync(STATE)&&!git(['status','--porcelain','--untracked-files=no']),'NSDOCS_CODEC_PROD_ESTADO_OU_TRACKED_ALTERADO');
   const m=verify(version),head=git(['rev-parse','HEAD']);check([BASE,OLD].includes(head),'NSDOCS_CODEC_PROD_HEAD_FORA_DA_BASE');
   git(['merge-base','--is-ancestor',head,version]);
   check(!git(['diff','--name-only',head,BASE,'--','backend',':(exclude)backend/src/generated/navegacaoFonteUnica.cjs']),'NSDOCS_CODEC_PROD_BACKEND_BASE_DIVERGENTE');
   const files=m.files.map(f=>{check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.old_sha256,'NSDOCS_CODEC_PROD_FONTE_BASE_DIVERGENTE');
    return {...f,old:fs.readFileSync(ROOT+'/'+f.path).toString('base64'),mode:fs.statSync(ROOT+'/'+f.path).mode&0o777};});
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'NSDOCS_CODEC_PROD_PROGRESSO_MUDOU');
   fs.mkdirSync(STATE,{mode:0o700});atomic(STATE+'/estado.json',JSON.stringify({phase:'preparado',head,version,files,protected:before}));
   console.log('NSDOCS_CODEC_PROD_PREPARADO. Backup privado de codigo; plano, banco, S3, processos e ambientes intactos.');return;
  }
  const s=state();same(s.protected,before);
  check(process.env.CONFIRM_PROD_BACKUP==='SIM'&&process.env.CONFIRM_PROD_BACKUP_TIMER==='SIM'
   &&process.env.CONFIRM_NSDOCS_PROD_CODEC_UPDATE==='SIM','NSDOCS_CODEC_PROD_CONFIRMACAO_AUSENTE');
  run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
  if(action==='aplicar'){
   if(s.phase==='aplicado'){check(git(['rev-parse','HEAD'])===s.version,'NSDOCS_CODEC_PROD_HEAD_DIVERGENTE');sourceCheck(s);console.log('NSDOCS_CODEC_PROD_JA_APLICADO. Sem nova alteracao.');return;}
   check(s.phase==='preparado'&&git(['rev-parse','HEAD'])===s.head&&!git(['status','--porcelain','--untracked-files=no']),'NSDOCS_CODEC_PROD_ESTADO_APLICAR_INVALIDO');
   verify(s.version);for(const f of s.files)check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.old_sha256,'NSDOCS_CODEC_PROD_FONTE_BASE_DIVERGENTE');
   s.phase='aplicando';atomic(STATE+'/estado.json',JSON.stringify(s));git(['merge','--ff-only',s.version]);sourceCheck(s);
   run(NODE,['--test',QA,'backend/scripts/validarNsdocsHistoricoProd.js','backend/scripts/validarNsdocsHistoricoProdGuardas.js','backend/scripts/validarNsdocsPlanoHistoricoProd.js'],
    {env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C',NODE_ENV:'test'},timeout:120000});
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'NSDOCS_CODEC_PROD_PROGRESSO_MUDOU');
   check(await health(),'NSDOCS_CODEC_PROD_HEALTH_FALHOU');s.phase='aplicado';atomic(STATE+'/estado.json',JSON.stringify(s));
   console.log(JSON.stringify({outcome:'NSDOCS_CODEC_PROD_APLICADO',commit:s.version,runtime_files:2,qa_aprovado:true,plan_preserved:true,
    processos_nodes_env_dumps_preservados:true,restarts:0,migrations:0,external_nsdocs_calls:0,database_writes:0,storage_calls:0}));return;
  }
  check(['aplicando','aplicado'].includes(s.phase)&&git(['rev-parse','HEAD'])===s.version,'NSDOCS_CODEC_PROD_RETORNO_FORA_DO_ESTADO');
  check(!git(['diff','--name-only']),'NSDOCS_CODEC_PROD_TRACKED_ALTERADO');sourceCheck(s);
  for(const f of s.files)atomic(ROOT+'/'+f.path,Buffer.from(f.old,'base64'),f.mode);
  sourceCheck(s,true);same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'NSDOCS_CODEC_PROD_PROGRESSO_MUDOU');
  s.phase='retornado';atomic(STATE+'/estado.json',JSON.stringify(s));
  console.log('NSDOCS_CODEC_PROD_RETORNADO. Codigo anterior dos dois arquivos; HEAD mantido, tracked alterado esperado. Plano/historico/XML preservados. Sem restart.');
 });
}
module.exports={main,inventory,hash,BASE,OLD,FILES,QA};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{
 console.error(/^NSDOCS_CODEC_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'NSDOCS_CODEC_PROD_INTERROMPIDO_SEM_SEGREDOS');
 console.error('Nao repita a captura, force Git ou remova locks. Envie a saida sem segredos.');process.exitCode=1;
});
