'use strict';
// Aplicacao MANUAL pelo operador. Banco somente no runner de schema nomeado.
// Codigo/schema aditivo verificados e um restart PROD, preservando heap e ambiente.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='2d6af625aff47f1592ae52d2448b9dc86a3c9c7e';
const RELEASE_PARENT=BASE;
const STARTING_HEADS=[BASE,'ece109c93f62268bb3f4108d658e9a817bff80f5','ceaf8da7d69a933bd033fb623642d1e6baff1926'];
const COMPAT=['backend/src/validators/operationalValidators.js','backend/scripts/validarSolicitacoesCompraPaginacao.js'];
const MIGRATION='202610280001_rh_privacidade_obra.js';
const SCHEMA='backend/scripts/rhPrivacidadeObraProdSchema.js';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const NAME='backend-solicitacoes',STATE=ROOT+'/.git/fluxy-rh-privacidade-prod-20261028';
const MANIFEST='ops/deploy/rh-privacidade-prod-20261028.manifest.json';
const SELF='ops/deploy/atualizar-prod-rh-privacidade-20261028.cjs';
const TEST='ops/deploy/atualizar-prod-rh-privacidade-20261028.test.cjs';
const FILES=["backend/migrations/202610280001_rh_privacidade_obra.js", "backend/scripts/validarRhColaboradoresPlanilha.js", "backend/scripts/validarRhConsultaSalario.js", "backend/scripts/validarRhLotacaoCadastro.js", "backend/scripts/validarRhPagamentoEnvioParcial.js", "backend/scripts/validarRhPagamentoSolicitacao.js", "backend/scripts/validarRhPessoalFluxo.js", "backend/scripts/validarRhPrivacidadeObra.js", "backend/src/controllers/RhColaboradorObraController.js", "backend/src/middlewares/rhPrivacidadeObra.js", "backend/src/models/RhColaborador.js", "backend/src/models/RhDocumento.js", "backend/src/routes.js", "backend/src/services/rhColaboradorObraService.js", "backend/src/services/rhPagamentoSolicitacaoDomain.js", "backend/src/services/rhPagamentoSolicitacaoService.js", "backend/src/services/rhPrivacidadeObraDomain.js", "backend/src/services/rhService.js", "backend/src/services/rhTransferenciaService.js", "backend/src/validators/rhValidators.js", "backend/scripts/rhPrivacidadeObraProdSchema.js", "backend/scripts/validarRhPrivacidadeObraProdSchema.js", "backend/src/validators/operationalValidators.js", "backend/scripts/validarSolicitacoesCompraPaginacao.js"];
const EXTRA=["ops/deploy/atualizar-prod-rh-privacidade-20261028.cjs", "ops/deploy/atualizar-prod-rh-privacidade-20261028.test.cjs", "ops/deploy/README-rh-privacidade-prod-20261028.md", "docs/handoffs/2026-10-28-promocao-rh-privacidade-main.md", "docs/workspace/OWNERSHIP_ATIVO.md", "docs/modulos/rh-dp/README.md"];
const QA=["validarRhPrivacidadeObra.js", "validarRhPrivacidadeObraProdSchema.js", "validarRhPagamentoSolicitacao.js", "validarRhConsultaSalario.js", "validarRhColaboradoresPlanilha.js", "validarRhColaboradorContatos.js", "validarRhPagamentoEnvioParcial.js", "validarRhLotacaoCadastro.js", "validarEscopoRhDpUsuarioObra.js", "validarColaboradoresLocaisEscopos.js", "validarRhPagamentoGerencial.js", "validarSolicitacoesCompraPaginacao.js", "validarComprasCarregamentoSemProduto.js", "validarCompraCotacaoEnvio.js", "validarFilaBaixaComposta.js", "validarAnaliseProprietario.js", "auditarPermissoesGranulares.js"];
const PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod',SOURCE='8e0a4179-506a-4670-88a2-d9079728e263',COMPLEMENT='c456781c-4393-468b-858f-dbf220d8f215';
const CLEAN={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/home/ubuntu',USER:'ubuntu',LOGNAME:'ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'};
const check=(ok,code)=>{if(!ok)throw Error('RH_PRIV_PROD_'+code);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,options={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,env:CLEAN,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...options});
 if(r.error||r.status!==0){const safe=String(r.stderr||'').split(/\r?\n/).find(v=>/^RH_PRIV_PROD_[A-Z0-9_]+$/.test(v));if(safe)throw Error(safe);check(false,'COMANDO_FALHOU');}return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function regular(file){const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'ARQUIVO_NAO_REGULAR');return s;}
function privateStat(file,dir=false){const s=fs.lstatSync(file);check(!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===(dir?0o700:0o600)&&(dir?s.isDirectory():s.isFile()&&s.nlink===1),'PRIVADO_INVALIDO');return s;}
function atomic(file,bytes,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes,{mode,flag:'wx',flush:true});fs.renameSync(tmp,file);}
function state(){privateStat(STATE,true);privateStat(STATE+'/estado.json');return JSON.parse(fs.readFileSync(STATE+'/estado.json','utf8'));}
function save(s,phase){s.phase=phase;atomic(STATE+'/estado.json',JSON.stringify(s));}
const upper=e=>Object.fromEntries(Object.entries(e||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&!k.startsWith('CONFIRM_')&&v!==undefined));
function procEnv(pid){return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));}
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
function blob(ref,file){return git(['ls-tree',ref,'--',file])?run('/usr/bin/git',['show',ref+':'+file],{encoding:null}):null;}
function inventory(m,names,read,oldRead){check(m.base===BASE&&m.release_parent===RELEASE_PARENT&&m.runtime_files===13&&m.business_data_writes===0&&m.migration===MIGRATION&&m.heap_mib===4096,'MANIFESTO_DIVERGENTE');
 check(canonical(m.files.map(f=>f.path))===canonical(FILES)&&canonical(m.extra.map(f=>f.path))===canonical(EXTRA),'ESCOPO_DIVERGENTE');
 check(canonical([...names].sort())===canonical([...m.files.filter(f=>f.sha256!==f.old_sha256).map(f=>f.path),...EXTRA,MANIFEST].sort()),'ARQUIVOS_EXTRAS');
 for(const f of [...m.files,...m.extra])check(hash(read(f.path))===f.sha256,'HASH_DIVERGENTE');
 for(const f of m.files){const old=oldRead(f.path);check((old===null?null:hash(old))===f.old_sha256,'BASE_HASH_DIVERGENTE');}}
function releaseChain(parent){check(parent===BASE,'BASE_DIVERGENTE');}
function verify(version){check(/^[a-f0-9]{40}$/.test(version||''),'SHA_INVALIDO');git(['fetch','origin','main']);git(['merge-base','--is-ancestor',version,'origin/main']);releaseChain(git(['rev-parse',version+'^']));
 const read=p=>{const bytes=blob(version,p);check(bytes!==null,'ARQUIVO_AUSENTE');return bytes;},m=JSON.parse(read(MANIFEST));
 inventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read,p=>blob(BASE,p));
 check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'EXCLUSAO_NEGADA');
 // Com node -, o operador confere o SHA256 local antes de enviar o script.
 if(process.argv[1]!=='-')check(hash(fs.readFileSync(__filename))===m.extra.find(f=>f.path===SELF).sha256,'APLICADOR_DIVERGENTE');return m;}
function sourceCheck(s,old=false){for(const f of s.files){const file=ROOT+'/'+f.path,wanted=old?f.old_sha256:f.sha256;if(wanted===null){check(!fs.existsSync(file),'FONTE_BASE_DIVERGENTE');continue;}regular(file);check(hash(fs.readFileSync(file))===wanted,'FONTE_DIVERGENTE');}}
function confirmations(env=process.env){check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_RH_PRIVACIDADE_PROD_SCHEMA'].every(k=>env[k]==='SIM'),'CONFIRME_BACKUP_TIMER_JANELA');}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:2000},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('error',()=>resolve(false));res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});});req.on('error',()=>resolve(false));req.on('timeout',()=>{req.destroy();resolve(false);});});}
function qa(){run(NODE,['--require','./scripts/helpers/semRedeQa.js','scripts/validarRhPessoalFluxo.js','--transferencias'],{cwd:BACKEND,env:{...CLEAN,NODE_ENV:'test'},timeout:120000});console.log('QA aprovado: transferencias');for(const file of FILES.filter(f=>f.startsWith('backend/src/')))run(NODE,['--check',file]);
 for(const file of QA){run(NODE,['--require','./scripts/helpers/semRedeQa.js','./scripts/'+file],{cwd:BACKEND,env:{...CLEAN,NODE_ENV:'test'},timeout:120000});console.log('QA aprovado: '+file);}
 run(NODE,['--test',TEST],{env:{...CLEAN,NODE_ENV:'test'},timeout:30000});console.log('QA aprovado: aplicador PROD');}
function protectedCheck(s,mode='exact'){const current=snapshot();same(s.protected,current,mode);check(canonical(s.data)===canonical(dataSnapshot()),'PLANO_OU_HISTORICO_MUDOU');return current;}
function restartNeeded(initial,current){check(current.restarts>=initial.restarts&&current.restarts<=initial.restarts+1,'RESTART_EXTRA');if(current.pid===initial.pid&&current.restarts===initial.restarts)return true;check(current.restarts===initial.restarts+1,'RESTART_DIVERGENTE');return false;}
async function restart(s,allowStart=false){const now=protectedCheck(s,'one'),initial=s.restart_before.apps.find(p=>p.name===NAME),current=now.apps.find(p=>p.name===NAME);same(s.restart_before,now,'one');
 if(restartNeeded(initial,current)){check(allowStart,'RESTART_PENDENTE_CONFERENCIA');console.log('Reiniciando SOMENTE backend-solicitacoes; heap 4096 MiB e ambiente preservados.');run(DAEMON,[CLI,'restart',String(initial.id)]);}
 let good=0,last=0;for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,2000));let snap;try{snap=snapshot();}catch{continue;}same(s.restart_before,snap,'one');const p=snap.apps.find(a=>a.name===NAME);
  good=p.pid!==initial.pid&&p.restarts===initial.restarts+1&&await health()?p.pid===last?good+1:1:0;last=p.pid;if(good>=3){protectedCheck(s,'one');return;}}
 check(false,'BACKEND_NAO_ESTABILIZOU');}
function schema(mode){
 const p=list().find(p=>p.name===NAME);check(p&&p.pid>1,'APP_AUSENTE');
 const env=procEnv(p.pid);
 if(mode==='--aplicar')for(const k of ['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_RH_PRIVACIDADE_PROD_SCHEMA'])env[k]=process.env[k];
 const out=run(NODE,['scripts/rhPrivacidadeObraProdSchema.js',mode],{cwd:BACKEND,env,timeout:120000});
 let result;try{result=JSON.parse(out.split(/\r?\n/).at(-1));}catch{check(false,'SCHEMA_RESPOSTA_INVALIDA');}
 check(result.outcome==='RH_PRIVACIDADE_SCHEMA_PROD'&&result.applied&&result.structure_ok&&!result.pending.length&&result.business_data_writes===0&&result.financial_data_writes===0&&result.external_calls===0,'SCHEMA_NAO_CONFERIDO');
 return result;
}
function startingHead(head,changes){
 check(STARTING_HEADS.includes(head),'HEAD_FORA_DA_BASE');
 check(changes.every(p=>COMPAT.includes(p)),'BACKEND_BASE_DIVERGENTE');
}
function preflightEnvironment(){
 const p=list().find(p=>p.name===NAME);check(p&&p.pid>1,'APP_AUSENTE');
 const code="require('dotenv').config({quiet:true,override:false});const {validateRequiredEnv}=require('./src/config/env');validateRequiredEnv();require('./src/modules/fiscal/services/nsdocsHistorical/manual/runtime').assertProdProcess();";
 run(NODE,['-e',code],{cwd:BACKEND,env:procEnv(p.pid)});
}
async function finish(s,io){
 if(s.phase==='arquivos_prontos'){await io.qa();const baseline=io.baseline();s.protected=baseline;io.save(s,'schema_pendente');}
 if(s.phase==='schema_pendente'){await io.migrate();const baseline=io.baseline();s.protected=baseline;s.restart_before=baseline;io.save(s,'schema_pronto');}
 if(s.phase==='schema_pronto'){
  const baseline=io.baseline();s.protected=baseline;s.restart_before=baseline;io.save(s,'reiniciando');
  await io.restart(true);await io.ready();io.save(s,'aplicado');return;
 }
 // Depois de resposta perdida, somente conferir; nunca emitir outro restart.
 if(s.phase==='reiniciando'){await io.restart(false);await io.ready();io.save(s,'aplicado');}
}
function report(s){console.log(JSON.stringify({outcome:'RH_PRIVACIDADE_BACKEND_PROD_PRONTO',phase:s.phase,commit:s.version,runtime_files:13,runtime_rh:12,consulta_compras_compativel:true,qa_aprovado:true,old_space_mib:4096,dev_experience_daemon_nodes_env_dumps_preservados:true,automatico_nsdocs_desligado:true,plano_historico_xmls_preservados:true,restarts:1,migration:MIGRATION,somente_schema_aditivo:true,business_data_writes:0,financial_data_writes:0,storage_calls:0,frontend_liberado:false}));}
async function main(action,version){check(['preparar','aplicar','conferir'].includes(action),'ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'&&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','CONTEXTO_INVALIDO');
 check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','GIT_INVALIDO');
 if(action==='conferir'){const s=state();check(s.phase==='aplicado'&&git(['rev-parse','HEAD'])===s.version&&!git(['status','--porcelain','--untracked-files=no']),'APLICACAO_INCOMPLETA');sourceCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');schema('--conferir');report(s);return;}
 return withLocks(async()=>{if(action==='preparar'){check(!fs.existsSync(STATE)&&!git(['status','--porcelain','--untracked-files=no']),'ESTADO_OU_TRACKED_ALTERADO');
   const m=verify(version),head=git(['rev-parse','HEAD']);startingHead(head,git(['diff','--name-only',head,BASE,'--','backend']).split(/\r?\n/).filter(Boolean));git(['merge-base','--is-ancestor',head,version]);
   preflightEnvironment();
   const before=snapshot(),data=dataSnapshot();check(await health(),'HEALTH_FALHOU');
   const files=m.files.map(f=>{const file=ROOT+'/'+f.path,exists=fs.existsSync(file),oldBlob=blob(head,f.path),oldHash=oldBlob===null?null:hash(oldBlob);if(exists)regular(file);check((exists?hash(fs.readFileSync(file)):null)===oldHash,'FONTE_BASE_DIVERGENTE');return{...f,base_old_sha256:f.old_sha256,old_sha256:oldHash,old:exists?fs.readFileSync(file).toString('base64'):null};});
   same(before,snapshot());check(canonical(data)===canonical(dataSnapshot()),'PROGRESSO_MUDOU');fs.mkdirSync(STATE,{mode:0o700});save({head,version,files,protected:before,data},'preparado');
   console.log('RH_PRIV_PROD_PREPARADO. Backup privado de codigo; heap 4096 conferido. Banco, planos, processos, ambientes e DEV intactos.');return;}
  confirmations();run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);const s=state();check(['preparado','atualizando','arquivos_prontos','schema_pendente','schema_pronto','reiniciando','aplicado'].includes(s.phase),'FASE_INVALIDA');
  if(s.phase==='aplicado'){check(git(['rev-parse','HEAD'])===s.version&&!git(['status','--porcelain','--untracked-files=no']),'HEAD_OU_TRACKED_DIVERGENTE');sourceCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');schema('--conferir');report(s);return;}
  protectedCheck(s,['preparado','atualizando','arquivos_prontos','schema_pendente','schema_pronto'].includes(s.phase)?'refresh':'one');
  if(['preparado','atualizando'].includes(s.phase)){const head=git(['rev-parse','HEAD']);check([s.head,s.version].includes(head)&&!git(['status','--porcelain','--untracked-files=no']),'HEAD_OU_TRACKED_DIVERGENTE');verify(s.version);
   if(head===s.head){sourceCheck(s,true);save(s,'atualizando');git(['merge','--ff-only',s.version]);}save(s,'arquivos_prontos');}
  check(git(['rev-parse','HEAD'])===s.version&&!git(['status','--porcelain','--untracked-files=no']),'HEAD_OU_TRACKED_DIVERGENTE');sourceCheck(s);
  await finish(s,{qa,migrate:()=>schema('--aplicar'),baseline:()=>protectedCheck(s,'refresh'),save,restart:allowStart=>restart(s,allowStart),ready:async()=>{sourceCheck(s);protectedCheck(s,'one');check(await health(),'HEALTH_FALHOU');schema('--conferir');}});report(s);
 });}
module.exports={main,BASE,RELEASE_PARENT,releaseChain,STARTING_HEADS,FILES,EXTRA,MANIFEST,SELF,TEST,QA,COMPAT,MIGRATION,SCHEMA,startingHead,canonical,hash,inventory,oldSpace,heap4096,automaticOff,same,confirmations,restartNeeded,finish};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{console.error(/^RH_PRIV_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'RH_PRIV_PROD_INTERROMPIDO_SEM_SEGREDOS');console.error('Nao repita reinicios nem remova estado ou locks. Envie somente esta saida.');process.exitCode=1;});
