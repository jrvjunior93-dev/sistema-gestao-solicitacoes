'use strict';
// Etapa de BACKEND. Nao altera .env, S3/IAM, dump, frontend ou Node. O corte
// do storage tem etapa separada; nenhum resultado daqui libera o frontend.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const BASE='a860f94afc4de69499a169a8439a8e2297f507d5',OLD='3f3c5e8fe7eb848f2feb22ea27c5daba5d184afd';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',CLI='/usr/lib/node_modules/pm2/bin/pm2';
const MANIFEST='ops/deploy/nfe-pedidos-producao-20261024.manifest.json',STATE=ROOT+'/.git/fluxy-nfe-prod-20261024';
const MIGRATION='202610240002_fiscal_vinculos_pedidos.js';
const QA=['validarFiscalPagamentoDocumentos.js','validarPedidoLocalizacao.js','validarVinculosNfePedidos.js',
  'validarFiscalVinculosProdSchema.js','validarFiscalS3RoleProd.js','validarFilaPagamentoSolicitacaoAcesso.js',
  'validarAutorizacaoProprietarioPagamentos.js','validarAnaliseProprietario.js','validarCompraEtapasResumoPedido.js',
  'validarPedidoCompraFinanceiroGeo.js','validarPedidoBoletoOpcional.js','validarSobreposicaoTitulos.js',
  'validarFiscalDfeProcessor.js','auditarPermissoesGranulares.js'];
const check=(v,c)=>{if(!v)throw Error(c);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(bin,args,opts={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});
  check(!r.error&&r.status===0,'NFE_PROD_COMANDO_FALHOU');return Buffer.isBuffer(r.stdout)?r.stdout:r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function clean(e){const v={...e};for(const k of Object.keys(v))if(k.startsWith('CONFIRM_')||['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID','ALLOW_SCHEMA_MIGRATIONS'].includes(k))delete v[k];return v;}
function procEnv(pid){return clean(Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})));}
function list(){const pid=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'NFE_PROD_DAEMON_DIFERENTE');
  return JSON.parse(run(DAEMON,[CLI,'jlist'],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}}));}
function snapshot(onlineProd=true){const ps=list();check(ps.length===3,'NFE_PROD_PROCESSOS_DIFERENTES');
  const expected=[['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],
    ['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
  const apps=expected.map(([name,cwd,node])=>{const a=ps.filter(p=>p.name===name);check(a.length===1,'NFE_PROD_PROCESSO_NAO_UNICO');const p=a[0],e=p.pm2_env;
    const online=e.status==='online'&&p.pid>1;
    check(Number.isSafeInteger(p.pm_id)&&e.pm_cwd===cwd&&e.exec_interpreter===node
      &&(online?fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd:!onlineProd&&name==='backend-solicitacoes'),'NFE_PROD_APP_OU_NODE_DIFERENTE');
    if(name==='backend-solicitacoes')check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length),'NFE_PROD_CONFIG_DIFERENTE');
    const keys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
    const upper=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&v!==undefined));
    const policy={config:Object.fromEntries(keys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e),nested:upper(e.env)};
    return{name,id:p.pm_id,pid:p.pid,env:online?hash(canonical(upper(procEnv(p.pid)))):null,envFile:hash(fs.readFileSync(cwd+'/.env')),node,policy:hash(canonical(policy))};});
  const files=['/usr/bin/node',DAEMON,...expected.map(a=>a[2]),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service'];
  const persisted=files.map(f=>{const s=fs.lstatSync(f);check(s.isFile()&&!s.isSymbolicLink(),'NFE_PROD_ARQUIVO_NAO_REGULAR');return[f,hash(fs.readFileSync(f)),s.mode,s.uid];});
  return{apps,persisted,daemon:fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8')};}
function same(before,after,allowProdRestart=false){check(canonical(before.persisted)===canonical(after.persisted)&&before.daemon===after.daemon,'NFE_PROD_PERSISTENCIA_OU_DAEMON_MUDOU');
  for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'NFE_PROD_APP_AUSENTE');const old={...a},next={...b};
    if(allowProdRestart&&a.name==='backend-solicitacoes'){delete old.pid;delete next.pid;if(next.env===null){delete old.env;delete next.env;}}check(canonical(old)===canonical(next),'NFE_PROD_APP_OU_AMBIENTE_MUDOU');}}
function validateInventory(m,names,read,oldPackage,oldLock){
  check(m.base===BASE&&m.source_dev==='2920e1f1ff17b681a77bd02128e67aee4021a955'&&m.migration===MIGRATION,'NFE_PROD_MANIFESTO_DIFERENTE');
  const expected=m.backend.map(f=>f.path).sort();check(canonical(names.filter(p=>p.startsWith('backend/')).sort())===canonical(expected),'NFE_PROD_BACKEND_FORA_DO_INVENTARIO');
  check(names.every(p=>p.startsWith('backend/')||p.startsWith('ops/deploy/')||p.startsWith('docs/')),'NFE_PROD_FRONTEND_OU_RAIZ_NO_PACOTE');
  check(!names.some(p=>p.startsWith('backend/src/generated/')),'NFE_PROD_NAVEGACAO_ANTES_DO_FRONTEND');
  for(const f of m.backend)check(hash(read(f.path))===f.sha256,'NFE_PROD_HASH_DIFERENTE');
  check(canonical(expected.filter(p=>p.startsWith('backend/migrations/')))===canonical(['backend/migrations/'+MIGRATION]),'NFE_PROD_MIGRATION_FORA_DO_ESCOPO');
  const pkg=JSON.parse(read('backend/package.json')),lock=JSON.parse(read('backend/package-lock.json'));
  check(pkg.dependencies['@aws-sdk/nested-clients']==='3.996.12'&&lock.packages[''].dependencies['@aws-sdk/nested-clients']==='3.996.12'
    &&oldLock.packages['node_modules/@aws-sdk/nested-clients'].version==='3.996.12','NFE_PROD_DEPENDENCIA_DIFERENTE');
  delete pkg.dependencies['@aws-sdk/nested-clients'];delete lock.packages[''].dependencies['@aws-sdk/nested-clients'];
  check(canonical(pkg.dependencies)===canonical(oldPackage.dependencies)&&canonical(lock)===canonical(oldLock),'NFE_PROD_DEPENDENCIAS_FORA_DO_ESCOPO');
}
function verifyVersion(version){check(/^[a-f0-9]{40}$/.test(version||''),'NFE_PROD_EXIGE_SHA_COMPLETO');
  git(['fetch','origin','main']);check(git(['rev-parse','origin/main'])===version,'NFE_PROD_MAIN_DIFERENTE');
  const read=p=>run('/usr/bin/git',['show',version+':'+p],{encoding:null}),m=JSON.parse(read(MANIFEST));
  const names=git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean);
  validateInventory(m,names,read,JSON.parse(git(['show',BASE+':backend/package.json'])),JSON.parse(git(['show',BASE+':backend/package-lock.json'])));
  check(!git(['diff','--diff-filter=D','--name-only',BASE,version]),'NFE_PROD_EXCLUSAO_NAO_PERMITIDA');return m;
}
function schemaProbe(p,apply=false){const env=procEnv(p.pid);if(apply)for(const k of ['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_FISCAL_VINCULOS_PROD_SCHEMA'])env[k]=process.env[k];
  const code=`require('./scripts/fiscalVinculosProdSchema').main([${JSON.stringify(apply?'--aplicar':'--conferir')}]).then(r=>console.log('NFE_SCHEMA:'+JSON.stringify(r))).catch(()=>{console.error('NFE_SCHEMA_FALHOU');process.exitCode=1;});`;
  const out=run(NODE,['-e',code],{cwd:BACKEND,env,timeout:120000});const line=out.split(/\r?\n/).find(s=>s.startsWith('NFE_SCHEMA:'));check(line,'NFE_PROD_SCHEMA_SEM_RESULTADO');return JSON.parse(line.slice(11));}
function ledgerProbe(initialEnv){const code=`const db=require('./src/database'),s=require('./scripts/fiscalVinculosProdSchema');(async()=>{try{await s.identity(db.query.bind(db));console.log('NFE_LEDGER:'+JSON.stringify(await s.state(db.query.bind(db))));}finally{await db.close();}})().catch(()=>{console.error('NFE_LEDGER_FALHOU');process.exitCode=1;});`;
  const out=run(NODE,['-e',code],{cwd:BACKEND,env:clean(initialEnv),timeout:45000});const line=out.split(/\r?\n/).find(s=>s.startsWith('NFE_LEDGER:'));check(line,'NFE_PROD_LEDGER_SEM_RESULTADO');return JSON.parse(line.slice(11));}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:3000},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});res.on('error',()=>resolve(false));});req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
function privateWrite(file,text,mode=0o600){const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,text,{mode,flag:'wx',flush:true});fs.renameSync(tmp,file);}
function loadState(){const file=STATE+'/estado.json',s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&s.uid===process.getuid(),'NFE_PROD_ESTADO_INSEGURO');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function restart(s){same(s.protected,snapshot(false),true);const p=list().find(p=>p.name==='backend-solicitacoes');
  console.log('Reiniciando SOMENTE backend-solicitacoes, preservando Node e ambiente.');
  run(DAEMON,[CLI,'restart',String(p.pm_id)],{env:{PATH:'/usr/bin:/bin',HOME:'/home/ubuntu',PM2_HOME:'/home/ubuntu/.pm2',LANG:'C'}});
  let good=0,last=0;for(let i=0;i<25;i++){const now=snapshot(false);same(s.protected,now,true);const next=now.apps.find(a=>a.name==='backend-solicitacoes');
    good=next.pid!==p.pid&&await health()?next.pid===last?good+1:1:0;last=next.pid;if(good>=5)return now;await new Promise(r=>setTimeout(r,2000));}
  throw Error('NFE_PROD_NAO_ESTABILIZOU');}
async function main(action,version){check(['preparar','aplicar','voltar','conferir'].includes(action),'NFE_PROD_MODO_INVALIDO');
  check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
    &&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS,'NFE_PROD_CONTEXTO_INVALIDO');
  check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['branch','--show-current'])==='main','NFE_PROD_CHECKOUT_INVALIDO');
  const lock=ROOT+'/.git/fluxy-nfe-prod-operacao.lock';fs.mkdirSync(lock,{mode:0o700});
  try{
    const before=snapshot(!['voltar','conferir'].includes(action));if(!['voltar','conferir'].includes(action))check(await health(),'NFE_PROD_HEALTH_INICIAL_FALHOU');
    if(action==='preparar'){
      check(!git(['status','--porcelain','--untracked-files=no']),'NFE_PROD_TRACKED_ALTERADO');check(!fs.existsSync(STATE),'NFE_PROD_ESTADO_JA_EXISTE');
      check(JSON.parse(fs.readFileSync(BACKEND+'/node_modules/@aws-sdk/nested-clients/package.json','utf8')).version==='3.996.12','NFE_PROD_SDK_INSTALADO_DIFERENTE');
      const m=verifyVersion(version),head=git(['rev-parse','HEAD']);check([BASE,OLD].includes(head),'NFE_PROD_HEAD_FORA_DA_BASE');git(['merge-base','--is-ancestor',head,version]);
      const originals=m.backend.filter(f=>git(['ls-tree',head,'--',f.path])).map(f=>({path:f.path,old:run('/usr/bin/git',['show',head+':'+f.path],{encoding:null}).toString('base64'),mode:fs.statSync(ROOT+'/'+f.path).mode&0o777,next:f.sha256}));
      same(before,snapshot());fs.mkdirSync(STATE,{mode:0o700});privateWrite(STATE+'/estado.json',JSON.stringify({schema:1,phase:'preparado',head,version,protected:before,originals,initialEnv:procEnv(before.apps.find(a=>a.name==='backend-solicitacoes').pid)},null,2));
      console.log('NFE_BACKEND_PROD_PREPARADO. Snapshot privado; checkout/env/schema/processos/dumps intactos.');return;
    }
    const s=loadState();same(s.protected,before,action!=='aplicar'||s.phase!=='preparado');
    if(action==='conferir'){
      check(git(['rev-parse','HEAD'])===(s.phase==='preparado'?s.head:s.version),'NFE_PROD_HEAD_MUDOU');
      if(s.phase==='backend_pronto'){
        check(!git(['status','--porcelain','--untracked-files=no']),'NFE_PROD_TRACKED_ALTERADO');
        for(const f of JSON.parse(git(['show',s.version+':'+MANIFEST])).backend)check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.sha256,'NFE_PROD_HASH_DIFERENTE');
      }
      console.log(JSON.stringify({phase:s.phase,head:git(['rev-parse','HEAD']),backend:s.version,frontend_liberado:false,storage_alterado:false,processos_nodes_dumps_preservados:true}));return;
    }
    check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE'].every(k=>process.env[k]==='SIM'),'NFE_PROD_BACKUP_TIMER_JANELA_NAO_CONFIRMADOS');
    run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
    if(action==='aplicar'){
      check(s.phase==='preparado'&&git(['rev-parse','HEAD'])===s.head&&!git(['status','--porcelain','--untracked-files=no']),'NFE_PROD_ESTADO_APLICAR_DIFERENTE');
      check(process.env.CONFIRM_FISCAL_VINCULOS_PROD_SCHEMA==='SIM','NFE_PROD_MIGRATION_NAO_CONFIRMADA');verifyVersion(s.version);
      check(JSON.parse(fs.readFileSync(BACKEND+'/node_modules/@aws-sdk/nested-clients/package.json','utf8')).version==='3.996.12','NFE_PROD_SDK_INSTALADO_DIFERENTE');
      s.phase='aplicando';privateWrite(STATE+'/estado.json',JSON.stringify(s));
      git(['merge','--ff-only',s.version]);check(git(['rev-parse','HEAD'])===s.version,'NFE_PROD_CHECKOUT_DIVERGENTE');
      for(const qa of QA){run(NODE,['scripts/'+qa,...(qa==='auditarPermissoesGranulares.js'?['--check']:[])],{cwd:BACKEND,env:clean(process.env),timeout:120000});console.log('QA aprovado: '+qa);}
      same(s.protected,snapshot());schemaProbe(list().find(p=>p.name==='backend-solicitacoes'));
      const schema=schemaProbe(list().find(p=>p.name==='backend-solicitacoes'),true);check(schema.applied&&schema.structure_ok,'NFE_PROD_SCHEMA_NAO_CONCLUIDO');
      s.phase='schema_pronto';privateWrite(STATE+'/estado.json',JSON.stringify(s));await restart(s);
      const final=schemaProbe(list().find(p=>p.name==='backend-solicitacoes'));check(final.applied&&final.structure_ok,'NFE_PROD_SCHEMA_POS_RESTART_DIFERENTE');
      s.phase='backend_pronto';privateWrite(STATE+'/estado.json',JSON.stringify(s));
      console.log(JSON.stringify({etapa:'NFE_PEDIDOS_BACKEND_PROD_PRONTO',commit:s.version,migration:MIGRATION,node:NODE,
        dev_experience_daemon_dumps_env_preservados:true,storage_alterado:false,frontend_liberado:false}));return;
    }
    check(['aplicando','schema_pronto','backend_pronto'].includes(s.phase)&&git(['rev-parse','HEAD'])===s.version,'NFE_PROD_RETORNO_FORA_DO_ESTADO');
    // Retorno exclusivo de codigo antes do corte de storage. Novos arquivos
    // ficam versionados/inertes; nao remover migration nem seus dados/ledger.
    for(const f of s.originals)check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.next,'NFE_PROD_ARQUIVO_EDITADO_APOS_DEPLOY');
    const changed=git(['diff','--name-only']);check(!changed,'NFE_PROD_MODIFICACAO_CONCORRENTE');
    const ledger=ledgerProbe(s.initialEnv);
    // A origem do ambiente fica no snapshot privado para retorno de processo offline.
    if(!ledger.applied){const file=BACKEND+'/migrations/'+MIGRATION;
      check(hash(fs.readFileSync(file))===JSON.parse(git(['show',s.version+':'+MANIFEST])).backend.find(f=>f.path==='backend/migrations/'+MIGRATION).sha256,'NFE_PROD_MIGRATION_EDITADA');
      fs.renameSync(file,STATE+'/migration-nao-registrada.js');}
    for(const f of s.originals)privateWrite(ROOT+'/'+f.path,Buffer.from(f.old,'base64'),f.mode);
    s.phase='retornando_codigo';privateWrite(STATE+'/estado.json',JSON.stringify(s));await restart(s);
    s.phase='codigo_anterior';privateWrite(STATE+'/estado.json',JSON.stringify(s));
    console.log('NFE_PROD_CODIGO_ANTERIOR_ATIVO. HEAD mantido; fontes anteriores restauradas e tracked alterado esperado. Schema/historico/env/storage/DEV preservados. Nao executar reset/clean/pull para encerrar retorno.');
  }finally{fs.rmdirSync(lock);}
}
module.exports={main,validateInventory,canonical,clean,same,hash,BASE,QA};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{
  console.error(/^NFE_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'NFE_PROD_INTERROMPIDO_SEM_EXIBIR_SEGREDOS');
  console.error('Nao publique frontend, altere env/storage, contorne protecoes ou reinicie outros processos.');process.exitCode=1;
});
