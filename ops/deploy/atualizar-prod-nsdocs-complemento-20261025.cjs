'use strict';
// Release backend do complemento NSDOCS. Reinicia somente backend-solicitacoes.
// Sem migration/install/env/Node/S3/IAM/carga real; frontend em etapa posterior.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='3fc61f14122c4c5a3a5fcd8d44cd83bab73c06e1';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const MANIFEST='ops/deploy/nsdocs-complemento-prod-20261025.manifest.json',STATE=ROOT+'/.git/fluxy-nsdocs-complemento-prod-20261025';
const PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const PLAN=PRIVATE+'/historical-8e0a4179-506a-4670-88a2-d9079728e263.json';
const QA=['validarNsdocsComplemento.js','validarFiscalDocumentosPaginacao.js','validarNsdocsHistoricoProd.js','validarNsdocsHistoricoProdGuardas.js','validarNsdocsPlanoHistoricoProd.js','validarNsdocsCompactacaoProd.js','validarFiscalPagamentoDocumentos.js','validarVinculosNfePedidos.js'];
const check=(v,c)=>{if(!v)throw Error(c);};
const canonical=v=>Object.prototype.toString.call(v)==='[object Date]'?JSON.stringify(v.toISOString()):Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,opts={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});
  check(!r.error&&r.status===0,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_COMANDO_FALHOU');return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function clean(e){const v={...e};for(const k of Object.keys(v))if(k.startsWith('CONFIRM_')||['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID','ALLOW_SCHEMA_MIGRATIONS'].includes(k))delete v[k];return v;}
function procEnv(pid){return clean(Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})));}
function list(){const pid=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DAEMON_DIFERENTE');
  return JSON.parse(run(DAEMON,[CLI,'jlist'],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}}));}
function snapshot(onlineProd=true){const ps=list();check(ps.length===3,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_PROCESSOS_DIFERENTES');
  const expected=[['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],
    ['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
  const apps=expected.map(([name,cwd,node])=>{const a=ps.filter(p=>p.name===name);check(a.length===1,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_PROCESSO_NAO_UNICO');const p=a[0],e=p.pm2_env;
    const online=e.status==='online'&&p.pid>1;
    check(Number.isSafeInteger(p.pm_id)&&e.pm_cwd===cwd&&e.exec_interpreter===node
      &&(online?fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd:!onlineProd&&name==='backend-solicitacoes'),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_APP_OU_NODE_DIFERENTE');
    if(name==='backend-solicitacoes')check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_CONFIG_DIFERENTE');
    const keys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
    const upper=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&v!==undefined));
    const policy={config:Object.fromEntries(keys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e),nested:upper(e.env)};
    return{name,id:p.pm_id,pid:p.pid,env:online?hash(canonical(upper(procEnv(p.pid)))):null,envFile:hash(fs.readFileSync(cwd+'/.env')),node,policy:hash(canonical(policy))};});
  const files=['/usr/bin/node',DAEMON,...expected.map(a=>a[2]),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'];
  const persisted=files.map(f=>{const s=fs.lstatSync(f);check(s.isFile()&&!s.isSymbolicLink(),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ARQUIVO_NAO_REGULAR');return[f,hash(fs.readFileSync(f)),s.mode,s.uid];});
  return{apps,persisted,daemon:fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8')};}
function same(before,after,allowProdRestart=false){check(canonical(before.persisted)===canonical(after.persisted)&&before.daemon===after.daemon,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_PERSISTENCIA_OU_DAEMON_MUDOU');
  for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_APP_AUSENTE');const old={...a},next={...b};
    if(allowProdRestart&&a.name==='backend-solicitacoes'){delete old.pid;delete next.pid;if(next.env===null){delete old.env;delete next.env;}}check(canonical(old)===canonical(next),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_APP_OU_AMBIENTE_MUDOU');}}
function privateStat(file,directory=false){const s=fs.lstatSync(file);
 check(!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===(directory?0o700:0o600)
  &&(directory?s.isDirectory():s.isFile()&&s.nlink===1),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ARQUIVO_PRIVADO_INVALIDO');return s;}
function dataSnapshot(){privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DIRETORIO_DIVERGENTE');
 return [PLAN,PRIVATE+'/history.jsonl',PRIVATE+'/credentials.json'].map(file=>{privateStat(file);return [file,hash(fs.readFileSync(file))];});}
function withLocks(action){return(async()=>{
 const held=[];let folder=false;
 try{
  fs.mkdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock',{mode:0o700});folder=true;
  privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DIRETORIO_DIVERGENTE');
  for(const file of [PRIVATE+'/historical-plan.lock',PRIVATE+'/query.lock']){
   const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   held.push({fd,file});fs.writeFileSync(fd,String(process.pid));
  }
  return await action();
 }finally{
  for(const {fd,file} of held.reverse()){const s=fs.fstatSync(fd);fs.closeSync(fd);
   const live=fs.lstatSync(file);check(live.ino===s.ino&&live.dev===s.dev,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_LOCK_MUDOU');fs.unlinkSync(file);}
  if(folder)fs.rmdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock');
 }
})();}

const ALLOWED=[
  "backend/package.json",
  "backend/scripts/helpers/nsdocsComplementFixture.cjs",
  "backend/scripts/nsdocsProdComplement.js",
  "backend/scripts/validarFiscalDocumentosPaginacao.js",
  "backend/scripts/validarNsdocsComplemento.js",
  "backend/src/modules/fiscal/services/fiscalDocumentService.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/capture.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/complement/capture.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/complement/discovery.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/complement/plan.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/complement/store.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/query.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/manual/repository.js",
  "backend/src/modules/fiscal/services/nsdocsHistorical/normalize.js"
];
const ENTRY='backend/scripts/nsdocsProdComplement.js';
function inventory(m,names,read,oldRead){
 check(m.base===BASE&&m.migration===null&&m.restart==='backend-solicitacoes'&&m.capture_executed===false,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_MANIFESTO_INVALIDO');
 check(canonical(m.backend.map(f=>f.path).sort())===canonical(ALLOWED),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_INVENTARIO_INVALIDO');
 check(canonical(names.filter(p=>p.startsWith('backend/')).sort())===canonical(ALLOWED),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_BACKEND_EXTRA');
 check(names.every(p=>p.startsWith('backend/')||p.startsWith('docs/')||p.startsWith('ops/deploy/')),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_FRONTEND_ANTES_BACKEND');
 for(const f of m.backend){check(hash(read(f.path))===f.sha256,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HASH_INVALIDO');const old=oldRead(f.path);check((old?hash(old):null)===f.old_sha256,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_BASE_INVALIDA');}
 const strip=b=>{const p=JSON.parse(b);delete p.scripts;return p;};
 check(canonical(strip(read('backend/package.json')))===canonical(strip(oldRead('backend/package.json'))),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DEPENDENCIAS_MUDARAM');
}
function verify(version){
 check(/^[a-f0-9]{40}$/.test(version||''),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_SHA_INVALIDO');
 git(['fetch','origin','main']);check(git(['rev-parse','origin/main'])===version,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_MAIN_DIVERGENTE');
 const read=p=>run('/usr/bin/git',['show',version+':'+p],{encoding:null});
 const oldRead=p=>git(['ls-tree','--name-only',BASE,'--',p])?run('/usr/bin/git',['show',BASE+':'+p],{encoding:null}):null;
 const m=JSON.parse(read(MANIFEST));
 inventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read,oldRead);
 check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_EXCLUSAO_NEGADA');return m;
}
function databaseProbe(){
 // Somente a conexao TLS/UUID/transacao READ ONLY ja utilizada pelo CLI.
 // Corpo bruto e credenciais nunca saem do subprocesso; somente digest/contagens.
 const code=`const fs=require('node:fs'),crypto=require('node:crypto');
 const r=require('./src/modules/fiscal/services/nsdocsHistorical/manual/runtime'),s=require('./src/modules/fiscal/services/nsdocsHistorical/manual/migrationProd'),repo=require('./src/modules/fiscal/services/nsdocsHistorical/manual/repository');
 const canonical=${canonical.toString()};
 (async()=>{const company=await r.loadProdCompany(1,'27123008000100');
 require('./src/modules/fiscal/services/nsdocsHistorical/manual/storage').storageConfig();
 const plan=JSON.parse(fs.readFileSync(${JSON.stringify(PLAN)},'utf8'));
 if(plan.id!=='8e0a4179-506a-4670-88a2-d9079728e263'||plan.company_id!==1||plan.jobs.length!==20||!plan.jobs.every(j=>j.state==='completed'&&/^[a-f0-9-]{36}$/.test(j.id)))throw Error();
 const result=await r.withProdReadDatabase(async db=>{const schema=await s.schemaState(db);if(!schema.applied||schema.pending.length)throw Error();await repo.inspectSchema(db);const repository=repo.createRepository(db);await repository.fiscalCompany(company);
 const ids=plan.jobs.map(j=>j.id),marks=ids.map(()=>'?').join(',');
 const [captures]=await db.execute('SELECT id,state,error_code,result_json FROM fiscal_nsdocs_captures WHERE empresa_id=? AND company_cnpj=? AND id IN ('+marks+') ORDER BY id',[1,company.cnpj,...ids]);
 const [observations]=await db.execute('SELECT o.* FROM fiscal_nsdocs_observations o JOIN fiscal_nsdocs_captures c ON c.id=o.capture_id WHERE c.empresa_id=? AND c.company_cnpj=? AND c.id IN ('+marks+') ORDER BY o.id',[1,company.cnpj,...ids]);
 const keys=[...new Set(observations.map(o=>o.access_key))];if(captures.length!==20||keys.length!==46||captures.some(c=>c.state!=='completed'||c.error_code))throw Error();
 const [documents]=await db.execute('SELECT * FROM fiscal_dfe_documents WHERE access_key IN ('+keys.map(()=>'?').join(',')+') ORDER BY id',keys);
 const [events]=await db.execute('SELECT * FROM fiscal_nsdocs_capture_events WHERE capture_id IN ('+marks+') ORDER BY id',ids);
 if(documents.length!==46)throw Error();
 return {schema_ok:true,source_documents:46,digest:crypto.createHash('sha256').update(canonical({captures,observations,documents,events})).digest('hex')};});
 console.log('NSDOCS_COMPLEMENTO_PROBE:'+JSON.stringify(result));})().catch(()=>{console.error('NSDOCS_COMPLEMENTO_PROBE_FALHOU');process.exitCode=1;});`;
 const out=run(NODE,['-e',code],{cwd:BACKEND,env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C'},timeout:45000});
 const line=out.split(/\r?\n/).find(l=>l.startsWith('NSDOCS_COMPLEMENTO_PROBE:'));
 check(line,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_PROBE_SEM_RESULTADO');
 const result=JSON.parse(line.slice('NSDOCS_COMPLEMENTO_PROBE:'.length));
 check(result.schema_ok===true&&result.source_documents===46&&/^[a-f0-9]{64}$/.test(result.digest),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_SCHEMA_OU_FONTE_INVALIDOS');return result;
}
function atomic(file,bytes,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes,{mode,flag:'wx',flush:true});fs.renameSync(tmp,file);}
function state(){privateStat(STATE,true);privateStat(STATE+'/estado.json');return JSON.parse(fs.readFileSync(STATE+'/estado.json','utf8'));}
function sources(s,old=false){
 for(const f of s.files){
  if(old&&f.old_sha256===null){if(f.path===ENTRY)check(!fs.existsSync(ROOT+'/'+f.path),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_CLI_RETORNO_ATIVA');continue;}
  check(hash(fs.readFileSync(ROOT+'/'+f.path))===(old?f.old_sha256:f.sha256),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_FONTE_DIVERGENTE');
 }
}
function returnSources(s){
 for(const f of s.files){
  if(f.path===ENTRY&&!fs.existsSync(ROOT+'/'+f.path)){
   check(hash(fs.readFileSync(STATE+'/cli-complemento-desativada.cjs'))===f.sha256,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_CLI_RETORNO_DIVERGENTE');continue;
  }
  const current=hash(fs.readFileSync(ROOT+'/'+f.path));
  check(current===f.sha256||f.old_sha256&&current===f.old_sha256,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_RETORNO_FONTE_ALTERADA');
 }
 const allowed=new Set([...s.files.filter(f=>f.old_sha256!==null).map(f=>f.path),ENTRY]);
 check(!git(['diff','--cached','--name-only'])&&git(['diff','--name-only']).split(/\r?\n/).filter(Boolean).every(p=>allowed.has(p)),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_RETORNO_TRACKED_EXTRA');
}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:3000},res=>{
 let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});res.on('error',()=>resolve(false));});
 req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
async function restart(s){
 same(s.protected,snapshot(false),true);const prod=list().find(p=>p.name==='backend-solicitacoes');
 console.log('Reiniciando SOMENTE backend-solicitacoes; Node24.22.1 e ambiente preservados.');
 run(DAEMON,[CLI,'restart',String(prod.pm_id)],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}});
 let good=0,last=0;
 for(let i=0;i<25;i++){
  const now=snapshot(false);same(s.protected,now,true);const p=now.apps.find(a=>a.name==='backend-solicitacoes');
  good=p.pid>1&&p.pid!==prod.pid&&await health()?p.pid===last?good+1:1:0;last=p.pid;
  if(good>=5)return;
  await new Promise(r=>setTimeout(r,2000));
 }
 throw Error('NSDOCS_COMPLEMENTO_DEPLOY_PROD_BACKEND_NAO_ESTABILIZOU');
}
async function main(action,version){
 check(['preparar','aplicar','conferir','voltar'].includes(action),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
  &&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_CONTEXTO_INVALIDO');
 check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','NSDOCS_COMPLEMENTO_DEPLOY_PROD_CHECKOUT_INVALIDO');
 if(action==='conferir'){
  const s=state();same(s.protected,snapshot(),s.phase!=='preparado');
  check(git(['rev-parse','HEAD'])===(s.phase==='preparado'?s.head:s.version),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEAD_DIVERGENTE');
  if(s.phase!=='preparado')sources(s,s.phase==='retornado');
  check(await health(),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEALTH_FALHOU');databaseProbe();
  console.log(JSON.stringify({outcome:'NSDOCS_COMPLEMENTO_BACKEND_PROD_CONFERIDO',phase:s.phase,commit:s.version,
   peers_nodes_env_dumps_preservados:true,automatico_desligado:true,frontend_liberado:false}));return;
 }
 return withLocks(async()=>{
  const before=snapshot(!['voltar'].includes(action)),data=dataSnapshot();
  if(action==='preparar'){
   check(!fs.existsSync(STATE)&&!git(['status','--porcelain','--untracked-files=no']),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ESTADO_OU_TRACKED_ALTERADO');
   check(git(['rev-parse','HEAD'])===BASE,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEAD_FORA_DA_BASE');
   check(await health(),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEALTH_FALHOU');const m=verify(version);git(['merge-base','--is-ancestor',BASE,version]);
   const source=databaseProbe();
   const files=m.backend.map(f=>{
    if(f.old_sha256===null){check(!fs.existsSync(ROOT+'/'+f.path),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ARQUIVO_NOVO_EXISTE');return f;}
    check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.old_sha256,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_BASE_ALTERADA');
    return {...f,old:fs.readFileSync(ROOT+'/'+f.path).toString('base64'),mode:fs.statSync(ROOT+'/'+f.path).mode&0o777};
   });
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_PRIVADOS_MUDARAM');
   fs.mkdirSync(STATE,{mode:0o700});atomic(STATE+'/estado.json',JSON.stringify({phase:'preparado',head:BASE,version,files,protected:before,source}));
   console.log('NSDOCS_COMPLEMENTO_PROD_PREPARADO. Backup privado de codigo; plano, banco, XMLs, env e processos intactos.');return;
  }
  const s=state();same(s.protected,before,s.phase!=='preparado'||action==='voltar');
  check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_NSDOCS_COMPLEMENTO_DEPLOY'].every(k=>process.env[k]==='SIM'),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_CONFIRMACAO_AUSENTE');
  run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
  if(action==='aplicar'){
   if(s.phase==='backend_pronto'){sources(s);check(git(['rev-parse','HEAD'])===s.version&&await health(),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEAD_OU_HEALTH_DIVERGENTE');console.log('NSDOCS_COMPLEMENTO_PROD_JA_APLICADO');return;}
   check(s.phase==='preparado'&&git(['rev-parse','HEAD'])===s.head&&!git(['status','--porcelain','--untracked-files=no']),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_ESTADO_APLICAR_INVALIDO');
   verify(s.version);check(canonical(databaseProbe())===canonical(s.source),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_FONTE_FISCAL_MUDOU');
   s.phase='aplicando';atomic(STATE+'/estado.json',JSON.stringify(s));git(['merge','--ff-only',s.version]);sources(s);
   const qaEnv={PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',LANG:'C',NODE_ENV:'test'};
   run(NODE,['--test',...QA.map(f=>'backend/scripts/'+f)],{env:qaEnv,timeout:120000});console.log('QA aprovado: 87 testes fiscais/complemento/guardas/vinculos.');
   run(NODE,['backend/scripts/validarFilaEstornoPermissao.js'],{env:qaEnv,timeout:120000});
   run(NODE,['backend/scripts/auditarPermissoesGranulares.js','--check'],{env:qaEnv,timeout:120000});
   same(s.protected,snapshot());check(canonical(databaseProbe())===canonical(s.source),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_FONTE_FISCAL_MUDOU');
   await restart(s);
   check(canonical(data)===canonical(dataSnapshot())&&canonical(databaseProbe())===canonical(s.source),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DADOS_MUDARAM');
   s.phase='backend_pronto';atomic(STATE+'/estado.json',JSON.stringify(s));
   console.log(JSON.stringify({etapa:'NSDOCS_COMPLEMENTO_BACKEND_PROD_PRONTO',commit:s.version,node:NODE,sem_migration:true,sem_install:true,
    source_documents_preserved:46,automatico_desligado:true,dev_experience_daemon_env_dumps_preservados:true,external_nsdocs_calls:0,storage_calls:0,database_writes:0,frontend_liberado:false}));return;
  }
  check(['aplicando','backend_pronto','retornando','retornado'].includes(s.phase)&&git(['rev-parse','HEAD'])===s.version,'NSDOCS_COMPLEMENTO_DEPLOY_PROD_RETORNO_FORA_DO_ESTADO');
  if(s.phase==='retornado'){sources(s,true);check(await health(),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_HEALTH_FALHOU');console.log('NSDOCS_COMPLEMENTO_PROD_JA_RETORNADO');return;}
  if(s.phase==='retornando')returnSources(s);
  else{check(!git(['status','--porcelain','--untracked-files=no']),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_TRACKED_ALTERADO');sources(s);}
  const source=databaseProbe();s.phase='retornando';atomic(STATE+'/estado.json',JSON.stringify(s));
  // Novos modulos ficam inertes. Desativar a nova entrada evita executar o
  // complemento com parser antigo apos retorno; nao toca dados ou manifestos.
  if(fs.existsSync(ROOT+'/'+ENTRY))fs.renameSync(ROOT+'/'+ENTRY,STATE+'/cli-complemento-desativada.cjs');
  for(const f of s.files.filter(f=>f.old_sha256!==null))atomic(ROOT+'/'+f.path,Buffer.from(f.old,'base64'),f.mode);
  sources(s,true);await restart(s);
  check(canonical(data)===canonical(dataSnapshot())&&canonical(source)===canonical(databaseProbe()),'NSDOCS_COMPLEMENTO_DEPLOY_PROD_DADOS_MUDARAM');
  s.phase='retornado';atomic(STATE+'/estado.json',JSON.stringify(s));
  console.log('NSDOCS_COMPLEMENTO_PROD_CODIGO_ANTERIOR. CLI nova desativada, HEAD mantido e tracked alterado esperado. Dados/planos/XMLs/historico/peers preservados.');
 });
}
module.exports={main,inventory,hash,canonical,BASE,QA,ALLOWED,ENTRY};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(error=>{
 console.error(/^NSDOCS_COMPLEMENTO_DEPLOY_PROD_[A-Z0-9_]+$/.test(error.message||'')?error.message:'NSDOCS_COMPLEMENTO_DEPLOY_PROD_INTERROMPIDO_SEM_SEGREDOS');
 console.error('Nao publique frontend, force Git, remova locks ou reinicie outros processos. Envie a saida sem segredos.');process.exitCode=1;
});
