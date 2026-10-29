'use strict';
// Executado SOMENTE pelo operador. Atualizacao seletiva de codigo, sem SQL/schema.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='40e3239afd714e4ca70b45ecbb83ad58ba8d326a';
const HEADS=['15a86635b4f26bd911b76d83023b6fb3592919d9','ade6e6dcb9f9b270bcaed7388ad84aeeef8b8b0d',BASE];
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const NAME='backend-solicitacoes',STATE=ROOT+'/.git/fluxy-comprovantes-compartilhados-prod-20261029';
const SELF='ops/deploy/atualizar-prod-comprovantes-compartilhados-20261029.cjs',TEST='ops/deploy/atualizar-prod-comprovantes-compartilhados-20261029.test.cjs';
const MANIFEST='ops/deploy/comprovantes-compartilhados-prod-20261029.manifest.json';
const RUNTIME=["backend/src/routes.js","backend/src/services/pagamentoFilaHistoricoService.js","backend/src/services/tituloCompartilhadoConsulta.js","backend/src/services/tituloFinanceiroService.js","backend/src/services/comprovanteCompartilhadoSolicitacaoService.js","backend/src/controllers/ComprovanteCompartilhadoSolicitacaoController.js"];
const QA=["validarComprovantesCompartilhados.cjs","validarFilaComprovantePendente.js","validarTitulosCompartilhados.js","validarFilaBaixaComposta.js","validarFilaBaixaEstorno.js"];
const FILES=[...RUNTIME,...QA.map(n=>'backend/scripts/'+n),'backend/scripts/helpers/semRedeQa.js'];
const FRONTEND=["frontend/src/components/financeiro/ComprovantesTituloSolicitacao.jsx","frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx","frontend/src/services/financeiro.js","frontend/src/hooks/usePosicaoFlutuante.js","frontend/scripts/validarComprovantesTituloSolicitacao.mjs","frontend/scripts/validarRhFiltrosDP.mjs"];
const EXTRA=["ops/deploy/atualizar-prod-comprovantes-compartilhados-20261029.cjs","ops/deploy/atualizar-prod-comprovantes-compartilhados-20261029.test.cjs","ops/deploy/README-comprovantes-compartilhados-prod-20261029.md","docs/handoffs/2026-10-29-promocao-comprovantes-filtros-main.md","docs/workspace/OWNERSHIP_ATIVO.md","backend/scripts/simularComprovanteCompartilhado6453.cjs","docs/auditorias/comprovante-compartilhado-6453-evidencia-20261029.json",...FRONTEND];
const PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod',SOURCE='8e0a4179-506a-4670-88a2-d9079728e263',COMPLEMENT='c456781c-4393-468b-858f-dbf220d8f215';
const CLEAN={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/home/ubuntu',USER:'ubuntu',LOGNAME:'ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'};
const parsePaths=v=>String(v).split(/\r?\n/).filter(Boolean);
const check=(ok,code)=>{if(!ok)throw Error('COMPROVANTES_COMPARTILHADOS_PROD_'+code);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,options={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,env:CLEAN,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...options});
 if(r.error||r.status!==0){const safe=String(r.stderr||'').split(/\r?\n/).find(v=>/^COMPROVANTES_COMPARTILHADOS_PROD_[A-Z0-9_]+$/.test(v));if(safe)throw Error(safe);check(false,spawnFailure(r));}return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
function spawnFailure(r){
 const errors=['ENOENT','EACCES','EPERM','E2BIG','EAGAIN','ENOMEM','ENOBUFS','ETIMEDOUT','EINVAL'];
 if(errors.includes(r.error?.code))return'SUBPROCESSO_'+r.error.code;
 if(['SIGABRT','SIGKILL','SIGSEGV','SIGTERM','SIGBUS'].includes(r.signal))return'SUBPROCESSO_'+r.signal;
 if(Number.isInteger(r.status)&&r.status>=0&&r.status<=255)return'COMANDO_EXIT_'+r.status;
 return'COMANDO_FALHOU';
}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function regular(file){const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'ARQUIVO_NAO_REGULAR');return s;}
function privateStat(file,dir=false){const s=fs.lstatSync(file);check(!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===(dir?0o700:0o600)&&(dir?s.isDirectory():s.isFile()&&s.nlink===1),'PRIVADO_INVALIDO');return s;}
function atomic(file,bytes,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes,{mode,flag:'wx',flush:true});fs.chmodSync(tmp,mode);fs.renameSync(tmp,file);}
function state(){privateStat(STATE,true);privateStat(STATE+'/estado.json');return JSON.parse(fs.readFileSync(STATE+'/estado.json','utf8'));}
function save(s,phase){s.phase=phase;atomic(STATE+'/estado.json',JSON.stringify(s));}
const upper=e=>Object.fromEntries(Object.entries(e||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&!k.startsWith('CONFIRM_')&&v!==undefined));
function procEnv(pid){return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));}
function childEnv(initial){
 // /proc conserva o ambiente inicial, inclusive os descritores IPC que o Node
 // ja removeu de process.env no bootstrap. Um filho CLI nao herda esse canal.
 // Copia independente: ambiente/snapshot do backend original nao sao alterados.
 const result={...initial};
 for(const key of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'])delete result[key];
 return result;
}
function nodeArgs(value){if(Array.isArray(value))return value;if(typeof value==='string'&&value.trim().startsWith('[')){try{const v=JSON.parse(value);check(Array.isArray(v),'HEAP_INVALIDO');return v;}catch{check(false,'HEAP_INVALIDO');}}return String(value||'').trim().split(/\s+/).filter(Boolean);}
function oldSpace(value){const args=nodeArgs(value);let result=null;
 for(let i=0;i<args.length;i++){const flag=args[i].replace(/_/g,'-');check(!/^--max-(?:old-space-size-percentage|heap-size)(?:=|$)/.test(flag),'HEAP_CONFLITANTE');
  if(/^--max-old-space-size(?:=|$)/.test(flag)){check(result===null,'HEAP_AMBIGUO');const n=flag.includes('=')?flag.split('=')[1]:args[++i];check(/^\d+$/.test(n||''),'HEAP_INVALIDO');result=Number(n);}}
 return result;}
function heap4096(configured,cmdline,env){
 check(oldSpace(configured)===4096&&!env.NODE_OPTIONS,'HEAP_4096_NAO_CONFERIDO');
 const actual=oldSpace(cmdline),metadata=env.node_args===undefined?null:oldSpace(env.node_args);
 check(env.node_args===undefined||metadata===4096,'HEAP_METADADO_DIVERGENTE');
 if(actual===4096)return;
 // PM2 ProcessContainerFork reescreve process.title, ocultando argv em /proc.
 // Aceitar SOMENTE o titulo exato esperado e a flag4096 no metadado do filho.
 const args=nodeArgs(cmdline),title=env.PROCESS_TITLE||'node '+BACKEND+'/server.js';
 check(actual===null&&args.length===1&&args[0]===title&&metadata===4096,'HEAP_4096_NAO_CONFERIDO');
}
function automaticOff(...sources){for(const source of sources){check(!/^(true|1|yes|on)$/i.test(String(source?.ALLOW_SCHEMA_MIGRATIONS||'').trim())&&source?.NODE_TLS_REJECT_UNAUTHORIZED!=='0','AMBIENTE_INSEGURO');for(const k of ['NSDOCS_V2_ENABLED','NSDOCS_V2_FIXTURES_ENABLED']){const v=source?.[k];check(v===undefined||v===false||v===''||String(v).toLowerCase()==='false','AUTOMATICO_LIGADO');}}}
function list(){const pid=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
 check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'DAEMON_DIFERENTE');return JSON.parse(run(DAEMON,[CLI,'jlist']));}
function snapshot(){const ps=list();check(ps.length===3,'PROCESSOS_DIFERENTES');
 const expected=[[NAME,BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
 const apps=expected.map(([name,cwd,node])=>{const found=ps.filter(p=>p.name===name);check(found.length===1,'APP_NAO_UNICA');const p=found[0],e=p.pm2_env;
  check(Number.isSafeInteger(p.pm_id)&&p.pid>1&&e.status==='online'&&e.pm_cwd===cwd&&e.exec_interpreter===node&&fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd,'APP_OU_NODE_DIFERENTE');
  const env=procEnv(p.pid);regular(cwd+'/.env');
  if(name===NAME){check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length),'CONFIG_PROD_DIFERENTE');
   heap4096(e.node_args,fs.readFileSync(`/proc/${p.pid}/cmdline`,'utf8').split('\0').filter(Boolean),env);
   automaticOff(e,e.env,env,require(BACKEND+'/node_modules/dotenv').parse(fs.readFileSync(BACKEND+'/.env')));}
  const keys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
  const policy={config:Object.fromEntries(keys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e),nested:upper(e.env)};
  return{name,id:p.pm_id,pid:p.pid,restarts:Number(e.restart_time||0),env:hash(canonical(upper(env))),envFile:hash(fs.readFileSync(cwd+'/.env')),node,policy:hash(canonical(policy))};});
 const files=['/usr/bin/node',DAEMON,...expected.map(a=>a[2]),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'];
 return{apps,persisted:files.map(f=>{const s=regular(f);return[f,hash(fs.readFileSync(f)),s.mode,s.uid];}),daemon:fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8')};}
function same(before,after,mode='exact'){check(canonical(before.persisted)===canonical(after.persisted)&&before.daemon===after.daemon,'PERSISTENCIA_OU_DAEMON_MUDOU');check(before.apps.length===after.apps.length,'INVENTARIO_MUDOU');
 for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'APP_AUSENTE');const old={...a},next={...b};
  if(a.name===NAME&&mode!=='exact'){check(Number.isSafeInteger(b.restarts)&&b.restarts>=a.restarts&&(mode==='refresh'||b.restarts<=a.restarts+1),'RESTART_EXTRA');for(const k of ['pid','restarts']){delete old[k];delete next[k];}}
  check(canonical(old)===canonical(next),'APP_OU_AMBIENTE_MUDOU');}}
function dataSnapshot(){privateStat(PRIVATE,true);check(fs.realpathSync(PRIVATE)===PRIVATE,'DIRETORIO_DIVERGENTE');
 const files=[PRIVATE+'/historical-'+SOURCE+'.json',PRIVATE+'/complement-'+COMPLEMENT+'.json',PRIVATE+'/history.jsonl'];
 const pointer=JSON.parse(fs.readFileSync(files[1],'utf8'));if(pointer.format==='manifest-progress-v1'){check(pointer.id===COMPLEMENT&&/^[0-9a-f-]{36}$/.test(pointer.manifest_id||''),'MANIFESTO_NSDOCS_INVALIDO');files.push(PRIVATE+'/complement-'+COMPLEMENT+'-'+pointer.manifest_id+'.manifest.json');}
 return files.map(file=>{privateStat(file);return[file,hash(fs.readFileSync(file))];});}
async function withLocks(action){const held=[];let owned=false;
 try{fs.mkdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock',{mode:0o700});owned=true;privateStat(PRIVATE,true);
  for(const file of [PRIVATE+'/historical-plan.lock',PRIVATE+'/query.lock',PRIVATE+'/executor-captura-'+COMPLEMENT+'.lock']){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);held.push({fd,file});fs.writeFileSync(fd,String(process.pid));}
  for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){let cmd;try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{continue;}
   check(!(/nsdocsProdComplement\.js/.test(cmd)&&/--capturar|--descobrir/.test(cmd)||/nsdocsProdCapture\.js/.test(cmd)&&/--executar-plano|--capturar/.test(cmd)||/executor-captura-/.test(cmd)&&/--executar-carga-autorizada/.test(cmd)),'CAPTURA_ATIVA');}
  return await action();
 }finally{for(const{fd,file}of held.reverse()){const s=fs.fstatSync(fd);fs.closeSync(fd);const live=fs.lstatSync(file);check(live.ino===s.ino&&live.dev===s.dev,'LOCK_MUDOU');fs.unlinkSync(file);}if(owned)fs.rmdirSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock');}}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:2000},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('error',()=>resolve(false));res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});});req.on('error',()=>resolve(false));req.on('timeout',()=>{req.destroy();resolve(false);});});}
function protectedCheck(s,mode='exact'){const current=snapshot();same(s.protected,current,mode);check(canonical(s.data)===canonical(dataSnapshot()),'PLANO_OU_HISTORICO_MUDOU');return current;}
function restartNeeded(initial,current){check(current.restarts>=initial.restarts&&current.restarts<=initial.restarts+1,'RESTART_EXTRA');if(current.pid===initial.pid&&current.restarts===initial.restarts)return true;check(current.restarts===initial.restarts+1,'RESTART_DIVERGENTE');return false;}
async function restart(s,allowStart=false){const now=protectedCheck(s,'one'),initial=s.restart_before.apps.find(p=>p.name===NAME),current=now.apps.find(p=>p.name===NAME);same(s.restart_before,now,'one');
 if(restartNeeded(initial,current)){check(allowStart,'RESTART_PENDENTE_CONFERENCIA');console.log('Reiniciando SOMENTE backend-solicitacoes; heap 4096 MiB e ambiente preservados.');run(DAEMON,[CLI,'restart',String(initial.id)]);}
 let good=0,last=0;for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,2000));let snap;try{snap=snapshot();}catch{continue;}same(s.restart_before,snap,'one');const p=snap.apps.find(a=>a.name===NAME);
  good=p.pid!==initial.pid&&p.restarts===initial.restarts+1&&await health()?p.pid===last?good+1:1:0;last=p.pid;if(good>=3){protectedCheck(s,'one');return;}}
 check(false,'BACKEND_NAO_ESTABILIZOU');}


function blob(ref,file){return git(['ls-tree',ref,'--',file])?run('/usr/bin/git',['show',ref+':'+file],{encoding:null}):null;}
function inventory(m,names,read,oldRead){
 check(m.base===BASE&&m.runtime_files===6&&m.sql===0&&m.migrations===0&&m.heap_mib===4096,'MANIFESTO_DIVERGENTE');
 check(canonical(m.files.map(f=>f.path))===canonical(FILES)&&canonical(m.extra.map(f=>f.path))===canonical(EXTRA),'ESCOPO_DIVERGENTE');
 check(canonical([...names].sort())===canonical([...m.files.filter(f=>f.sha256!==f.old_sha256).map(f=>f.path),...EXTRA,MANIFEST].sort()),'ARQUIVOS_EXTRAS');
 for(const f of [...m.files,...m.extra])check(hash(read(f.path))===f.sha256,'HASH_DIVERGENTE');
 for(const f of m.files){const old=oldRead(f.path);check((old===null?null:hash(old))===f.old_sha256,'BASE_HASH_DIVERGENTE');}
}
function verify(version){
 check(/^[a-f0-9]{40}$/.test(version||''),'SHA_INVALIDO');git(['fetch','origin','main']);git(['merge-base','--is-ancestor',version,'origin/main']);
 check(git(['rev-parse',version+'^'])===BASE&&git(['rev-list','--parents','-n','1',version]).split(' ').length===2,'BASE_DIVERGENTE');
 const read=p=>{const b=blob(version,p);check(b!==null,'ARQUIVO_AUSENTE');return b;},m=JSON.parse(read(MANIFEST));
 inventory(m,parsePaths(git(['diff','--name-only',BASE,version])),read,p=>blob(BASE,p));
 check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'EXCLUSAO_NEGADA');
 if(process.argv[1]!=='-')check(hash(fs.readFileSync(__filename))===m.extra.find(f=>f.path===SELF).sha256,'APLICADOR_DIVERGENTE');
 return m;
}
function sourceCheck(s,old=false){for(const f of s.files){const p=safeFile(f.path),wanted=old?f.old_sha256:f.sha256;
 if(wanted===null){check(!fs.existsSync(p),'FONTE_BASE_DIVERGENTE');continue;}check((regular(p).mode&0o777)===f.mode,'MODO_DIVERGENTE');check(hash(fs.readFileSync(p))===wanted,'FONTE_DIVERGENTE');}}
function safeFile(relative){
 check([...FILES,SELF,TEST,MANIFEST].includes(relative),'CAMINHO_FORA_ESCOPO');
 const file=ROOT+'/'+relative,parts=relative.split('/');
 for(let i=1;i<parts.length;i++){const p=ROOT+'/'+parts.slice(0,i).join('/'),s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink(),'DIRETORIO_DIVERGENTE');}
 if(fs.existsSync(file)){const s=regular(file);check(s.uid===1000,'DONO_DIVERGENTE');}return file;
}
function validateRuntimeDelta(paths){
 const overlays=['backend/src/services/compraTitulosAdicionaisService.js','backend/src/services/solicitacaoFilaOperacional.js'];
 for(const p of paths){
  if(RUNTIME.includes(p))continue;
  check(overlays.includes(p),'RUNTIME_FORA_ESCOPO');
  const expected=blob(BASE,p),file=ROOT+'/'+p;
  for(const dir of ['backend','backend/src','backend/src/services']){const d=fs.lstatSync(ROOT+'/'+dir);check(d.isDirectory()&&!d.isSymbolicLink(),'DIRETORIO_OVERLAY_DIVERGENTE');}
  const s=regular(file);check(s.uid===1000&&expected!==null&&hash(fs.readFileSync(file))===hash(expected),'OVERLAY_DIVERGENTE');
 }
}
function outside(){return parsePaths(git(['diff','--name-only','HEAD'])).filter(p=>![...FILES,SELF,TEST,MANIFEST].includes(p)).map(p=>{
 const file=ROOT+'/'+p,s=regular(file);return[p,hash(fs.readFileSync(file)),s.mode,s.uid];
 });}
function workingCheck(s){
 check(git(['rev-parse','HEAD'])===s.head&&hash(git(['ls-files','--stage','-z']))===s.index,'HEAD_OU_INDEX_MUDOU');
 // BASE ja contem a reabertura instalada como overlay sobre HEAD15a86635.
 // Qualquer outra diferenca de runtime, inclusive regressao de reabertura,
 // e recusada; fontes fora dos tres arquivos nao sao sobrescritas.
 validateRuntimeDelta(parsePaths(git(['diff','--name-only',BASE,'--','backend/src'])));
 check(canonical(outside())===canonical(s.outside),'FONTE_FORA_ESCOPO_MUDOU');
}
function install(s,read){for(const f of s.files){
 const p=safeFile(f.path),exists=fs.existsSync(p),current=exists?hash(fs.readFileSync(p)):null;
 check(current===f.old_sha256||current===f.sha256,'FONTE_PARCIAL_DIVERGENTE');
 if(current===f.sha256)continue;
 const bytes=read(f.path);check(hash(bytes)===f.sha256,'PAYLOAD_DIVERGENTE');atomic(p,bytes,f.mode);
}}
function confirmations(env=process.env){check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_COMPROVANTES_COMPARTILHADOS_PROD'].every(k=>env[k]==='SIM'),'CONFIRME_BACKUP_TIMER_JANELA');}
function qa(version){
 for(const file of RUNTIME)run(NODE,['--check',file]);
 for(const file of QA){run(NODE,['--require','./scripts/helpers/semRedeQa.js','./scripts/'+file,...(file==='validarPrecisaoCompras.cjs'?['--backend-only']:[])],{cwd:BACKEND,env:{...CLEAN,NODE_ENV:'test'},timeout:120000});console.log('QA aprovado: '+file);}
 run(NODE,['--test',TEST],{env:{...CLEAN,NODE_ENV:'test',COMPROVANTES_QA_COMMIT:version},timeout:120000});console.log('QA aprovado: aplicador seletivo PROD');
}
async function finish(s,io){
 if(s.phase==='arquivos_prontos'){
  await io.qa();const baseline=io.baseline();s.protected=baseline;s.restart_before=baseline;io.save(s,'reiniciando');
  await io.restart(true);await io.ready();io.save(s,'aplicado');return;
 }
 if(s.phase==='reiniciando'){await io.restart(false);await io.ready();io.save(s,'aplicado');}
}
function report(s){console.log(JSON.stringify({outcome:'COMPROVANTES_COMPARTILHADOS_BACKEND_PROD_PRONTO',phase:s.phase,commit:s.version,head_instalado_preservado:s.head,
 runtime_files:6,historico_financeiro_preservado:true,reabertura_preservada:true,precisao_instalada_preservada:true,
 qa_aprovado:true,old_space_mib:4096,dev_experience_daemon_nodes_env_dumps_preservados:true,automatico_nsdocs_desligado:true,
 plano_historico_xmls_preservados:true,restarts:1,migrations:0,sql:0,business_data_writes:0,financial_data_writes:0,
 titulos_criados:0,baixas_executadas:0,storage_calls:0,frontend_compativel:true}));}
async function main(action,version){
 check(['preparar','aplicar','conferir'].includes(action),'ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'&&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','CONTEXTO_INVALIDO');
 check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','GIT_INVALIDO');
 if(action==='conferir'){const s=state();check(s.phase==='aplicado','APLICACAO_INCOMPLETA');workingCheck(s);sourceCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');report(s);return;}
 return withLocks(async()=>{
  if(action==='preparar'){
   const m=verify(version);
   if(fs.existsSync(STATE)){const s=state();check(s.version===version&&s.phase==='preparado','ESTADO_EXISTENTE');workingCheck(s);sourceCheck(s,true);protectedCheck(s,'refresh');console.log('COMPROVANTES_COMPARTILHADOS_PROD_PREPARADO. Preparacao existente conferida.');return;}
   const head=git(['rev-parse','HEAD']);check(HEADS.includes(head)&&!git(['diff','--cached','--name-only']),'HEAD_OU_INDEX_DIVERGENTE');
   validateRuntimeDelta(parsePaths(git(['diff','--name-only',BASE,'--','backend/src'])));
   const before=snapshot(),data=dataSnapshot();check(await health(),'HEALTH_FALHOU');
   const files=[...FILES,SELF,TEST,MANIFEST].map(p=>{
    const file=safeFile(p),exists=fs.existsSync(file),oldBlob=blob(BASE,p),oldHash=oldBlob===null?null:hash(oldBlob);
    const mode=exists?(regular(file).mode&0o777):0o644;
    check((exists?hash(fs.readFileSync(file)):null)===oldHash,'FONTE_BASE_DIVERGENTE');
    return{path:p,old_sha256:oldHash,sha256:hash(blob(version,p)),mode,backup:exists?fs.readFileSync(file).toString('base64'):null};
   });
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'PROGRESSO_MUDOU');
   fs.mkdirSync(STATE,{mode:0o700});save({head,version,files,index:hash(git(['ls-files','--stage','-z'])),outside:outside(),protected:before,data},'preparado');
   console.log('COMPROVANTES_COMPARTILHADOS_PROD_PREPARADO. Backup privado de codigo; heap4096, reabertura, precisao, historico, banco e DEV intactos.');return;
  }
  confirmations();run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);const s=state();
  check(['preparado','atualizando','arquivos_prontos','reiniciando','aplicado'].includes(s.phase),'FASE_INVALIDA');workingCheck(s);
  if(s.phase==='aplicado'){sourceCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');report(s);return;}
  protectedCheck(s,s.phase==='reiniciando'?'one':'refresh');
  if(['preparado','atualizando'].includes(s.phase)){
   verify(s.version);save(s,'atualizando');install(s,p=>blob(s.version,p));sourceCheck(s);workingCheck(s);save(s,'arquivos_prontos');
  }
  sourceCheck(s);workingCheck(s);
  await finish(s,{qa:()=>qa(s.version),baseline:()=>protectedCheck(s,'refresh'),save,restart:allow=>restart(s,allow),ready:async()=>{
   sourceCheck(s);workingCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');
  }});report(s);
 });
}
module.exports={BASE,HEADS,FILES,EXTRA,FRONTEND,MANIFEST,SELF,TEST,QA,RUNTIME,hash,canonical,inventory,install,safeFile,validateRuntimeDelta,oldSpace,heap4096,automaticOff,same,confirmations,restartNeeded,finish,childEnv,spawnFailure};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{
 console.error(/^COMPROVANTES_COMPARTILHADOS_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'COMPROVANTES_COMPARTILHADOS_PROD_INTERROMPIDO_SEM_SEGREDOS');
 console.error('Preserve estado e locks. Nao force Git nem repita reinicios; envie somente esta saida.');process.exitCode=1;
});
