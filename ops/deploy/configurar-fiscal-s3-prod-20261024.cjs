'use strict';
// Corte separado do deploy: somente4 variaveis fiscais, .env PROD, entrada
// PROD nos dois dumps e restart do id PROD. Nao importa API PM2 nem cria daemon.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend';
const VERSION='b5e34d7bb12fab45a81f5f2927c6bd15dfa0cbe2';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const PM='/home/ubuntu/.pm2',PKG='/usr/lib/node_modules/pm2',STATE=ROOT+'/.git/fluxy-fiscal-s3-prod-20261024';
const DROP='/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf';
const DUMPS=[PM+'/dump.pm2',PM+'/dump.pm2.bak'],ENVFILE=BACKEND+'/.env';
const PATCH=Object.freeze({FISCAL_S3_BUCKET:'fluxy-fiscal-prod',FISCAL_S3_REGION:'us-east-2',FISCAL_S3_PREFIX:'prod',FISCAL_S3_ROLE_ARN:'arn:aws:iam::992500432025:role/FluxyFiscalProd'});
const DISABLED=Object.freeze({...PATCH,FISCAL_S3_BUCKET:''});
const KEYS=Object.keys(PATCH),check=(v,c)=>{if(!v)throw Error(c);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function patchDotenv(text,values){
  check(typeof text==='string'&&!text.includes('\0'),'FISCAL_S3_PROD_ENV_INVALIDO');const newline=text.includes('\r\n')?'\r\n':'\n';let result=text;
  for(const key of KEYS){const re=new RegExp('^[\\t ]*(?:export[\\t ]+)?'+key+'[\\t ]*=[^\\r\\n]*','gm');const found=result.match(re)||[];
    check(found.length<=1,'FISCAL_S3_PROD_ENV_DUPLICADO');const line=key+'='+values[key];
    result=found.length?result.replace(re,line):result+(result&&!result.endsWith('\n')?newline:'')+line+newline;
  }return result;
}
function withoutFiscal(o){const v=structuredClone(o);for(const key of KEYS){delete v[key];if(v.env&&typeof v.env==='object')delete v.env[key];}return v;}
function patchDump(text,values){const before=JSON.parse(text);check(Array.isArray(before)&&before.length===3&&['backend-solicitacoes','backend-dev','fluxy-experience-api'].every(n=>before.filter(e=>e.name===n).length===1),'FISCAL_S3_PROD_DUMP_INVALIDO');
  for(const[name,node]of[['backend-dev','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],['fluxy-experience-api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']])check(before.find(e=>e.name===name).exec_interpreter===node,'FISCAL_S3_PROD_NODE_PERSISTIDO_DIFERENTE');
  const after=structuredClone(before),p=after.find(e=>e.name==='backend-solicitacoes');
  check(p.pm_cwd===BACKEND&&p.pm_exec_path===BACKEND+'/server.js'&&p.exec_interpreter===NODE&&p.env&&typeof p.env==='object'&&!Array.isArray(p.env),'FISCAL_S3_PROD_DUMP_PROD_DIFERENTE');
  Object.assign(p,values);Object.assign(p.env,values);
  check(before.every((e,i)=>canonical(e.name==='backend-solicitacoes'?withoutFiscal(e):e)===canonical(e.name==='backend-solicitacoes'?withoutFiscal(after[i]):after[i])),'FISCAL_S3_PROD_OUTRA_ENTRADA_MUDOU');
  return JSON.stringify(after,null,2)+'\n';
}
function restartPayload(id,nested,values){check(Number.isSafeInteger(id)&&id>=0&&nested&&typeof nested==='object'&&!Array.isArray(nested)&&Object.keys(nested).length>0,'FISCAL_S3_PROD_RPC_INVALIDO');
  check(canonical(values)===canonical(PATCH)||canonical(values)===canonical(DISABLED),'FISCAL_S3_PROD_PATCH_INVALIDO');
  return{id,env:{current_conf:{...values,env:{...structuredClone(nested),...values}}}};
}
function run(bin,args,opts={}){const r=cp.spawnSync(bin,args,{cwd:ROOT,encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});check(!r.error&&r.status===0,'FISCAL_S3_PROD_SUBPROCESSO_FALHOU');return r.stdout.trim();}
const git=args=>run('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args]);
function privateFile(file){const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===1000,'FISCAL_S3_PROD_ARQUIVO_INSEGURO');return s;}
function clean(e){const v={...e};for(const k of Object.keys(v))if(k.startsWith('CONFIRM_')||['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'].includes(k))delete v[k];return v;}
function initial(pid){return clean(Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})));}
function list(){const pid=Number(fs.readFileSync(PM+'/pm2.pid','utf8').trim());check(pid>1&&fs.readlinkSync(`/proc/${pid}/exe`)===DAEMON,'FISCAL_S3_PROD_DAEMON_DIFERENTE');
  const out=JSON.parse(run(DAEMON,[PKG+'/bin/pm2','jlist'],{env:{HOME:'/home/ubuntu',PM2_HOME:PM,PATH:'/usr/bin:/bin',LANG:'C'}}));
  check(Number(fs.readFileSync(PM+'/pm2.pid','utf8').trim())===pid,'FISCAL_S3_PROD_DAEMON_MUDOU');return out;
}
function snapshot(onlineProd=true){const ps=list();check(ps.length===3,'FISCAL_S3_PROD_PROCESSOS_DIFERENTES');
  const upper=(o,prod)=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]*$/.test(k)&&(!prod||!KEYS.includes(k))&&v!==undefined));
  const policyKeys=['name','pm_cwd','pm_exec_path','exec_interpreter','exec_mode','args','node_args','watch','ignore_watch','cron_restart','max_memory_restart','autorestart','min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace','merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env'];
  const apps=[['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']].map(([name,cwd,node])=>{
    const matches=ps.filter(p=>p.name===name);check(matches.length===1,'FISCAL_S3_PROD_APP_NAO_UNICA');const p=matches[0],e=p.pm2_env,online=e.status==='online'&&p.pid>1;
    check(Number.isSafeInteger(p.pm_id)&&e.pm_cwd===cwd&&e.exec_interpreter===node&&(online?fs.readlinkSync(`/proc/${p.pid}/exe`)===node&&fs.readlinkSync(`/proc/${p.pid}/cwd`)===cwd:!onlineProd&&name==='backend-solicitacoes'),'FISCAL_S3_PROD_APP_OU_NODE_DIFERENTE');
    if(name==='backend-solicitacoes')check(e.pm_exec_path===BACKEND+'/server.js'&&e.exec_mode==='fork_mode'&&(!e.watch||Array.isArray(e.watch)&&!e.watch.length)&&e.env&&Object.keys(e.env).length,'FISCAL_S3_PROD_CONFIG_DIFERENTE');
    const envFile=fs.readFileSync(cwd+'/.env','utf8');return{name,id:p.pm_id,pid:p.pid,node,
      env:online?hash(canonical(name==='backend-solicitacoes'?upper(initial(p.pid),true):initial(p.pid))):null,
      policy:hash(canonical({config:Object.fromEntries(policyKeys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])),flat:upper(e,name==='backend-solicitacoes'),nested:upper(e.env,name==='backend-solicitacoes')})),
      envFile:name==='backend-solicitacoes'?null:hash(envFile)};
  });
  const staticFiles=['/usr/bin/node',DAEMON,...apps.map(a=>a.node),'/etc/systemd/system/pm2-ubuntu.service',PKG+'/package.json',PKG+'/lib/Utility.js',PKG+'/lib/God/ActionMethods.js'];
  const persisted=staticFiles.map(f=>{const s=fs.statSync(f);return[f,hash(fs.readFileSync(f)),s.mode,s.uid];});
  const sources=JSON.parse(git(['show',VERSION+':ops/deploy/nfe-pedidos-producao-20261024.manifest.json'])).backend;
  for(const f of sources)check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.sha256,'FISCAL_S3_PROD_FONTE_ALTERADA');
  persisted.push(['backend-manifest',hash(canonical(sources)),0,0]);
  const unit=Object.fromEntries(run('/usr/bin/systemctl',['--system','show','pm2-ubuntu.service','--property=Id,ActiveState,UnitFileState,User,Type,MainPID,PIDFile,ExecStart,ExecStartPre,ExecStartPost,DropInPaths,EnvironmentFiles','--no-pager']).split(/\r?\n/).filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
  check(unit.Id==='pm2-ubuntu.service'&&unit.ActiveState==='active'&&unit.UnitFileState==='enabled'&&unit.User==='ubuntu'&&unit.Type==='forking'&&unit.PIDFile===PM+'/pm2.pid'&&String(unit.MainPID)===fs.readFileSync(PM+'/pm2.pid','utf8').trim()
    &&String(unit.ExecStart).includes(DAEMON+' '+PKG+'/bin/pm2 resurrect')&&unit.DropInPaths===DROP&&['ExecStartPre','ExecStartPost','EnvironmentFiles'].every(k=>!unit[k]),'FISCAL_S3_PROD_STARTUP_NAO_CONFERIDO');
  const drop=fs.lstatSync(DROP),dropText=fs.readFileSync(DROP,'utf8');
  const head='[Service]\nExecStart=\nExecStart='+DAEMON+' '+PKG+'/bin/pm2 resurrect\nExecStop=\nExecStop='+DAEMON+' '+PKG+'/bin/pm2 kill\nExecReload=\nExecReload='+DAEMON+' '+PKG+'/bin/pm2 reload all\n';
  const tail=dropText.startsWith(head)?dropText.slice(head.length):'';
  check(drop.isFile()&&!drop.isSymbolicLink()&&drop.nlink===1&&drop.uid===0&&(drop.mode&0o777)===0o644&&tail.startsWith('Environment="PATH='+path.posix.dirname(DAEMON)+':')&&/^Environment="PATH=[a-zA-Z0-9_/:.@+-]+"\n$/.test(tail),'FISCAL_S3_PROD_DROPIN_NODE_DIFERENTE');
  persisted.push([DROP,hash(dropText),drop.mode,drop.uid]);
  unit.ExecStart=DAEMON+' '+PKG+'/bin/pm2 resurrect';persisted.push(['systemd-resurrect',hash(canonical(unit)),0,0]);
  const socket=fs.lstatSync(PM+'/rpc.sock');check(socket.isSocket()&&socket.uid===1000&&!socket.isSymbolicLink(),'FISCAL_S3_PROD_SOCKET_INVALIDO');
  check(JSON.parse(fs.readFileSync(PKG+'/package.json','utf8')).version==='6.0.14','FISCAL_S3_PROD_PM2_VERSAO_DIFERENTE');
  return{apps,persisted,daemon:fs.readFileSync(PM+'/pm2.pid','utf8').trim()};
}
function same(before,after,allowRestart=false){check(before.daemon===after.daemon&&canonical(before.persisted)===canonical(after.persisted),'FISCAL_S3_PROD_DAEMON_NODE_OU_STARTUP_MUDOU');
  for(const a of before.apps){const b=after.apps.find(x=>x.name===a.name);check(b,'FISCAL_S3_PROD_APP_AUSENTE');const x={...a},y={...b};if(allowRestart&&a.name==='backend-solicitacoes'){delete x.pid;delete y.pid;if(y.env===null){delete x.env;delete y.env;}}check(canonical(x)===canonical(y),'FISCAL_S3_PROD_PEER_OU_OUTRA_CONFIG_MUDOU');}}
function rpc(method,payload,approvedId,nested,values){check((method==='stopProcessId'&&payload===approvedId)||(method==='restartProcessId'&&canonical(payload)===canonical(restartPayload(approvedId,nested,values))),'FISCAL_S3_PROD_RPC_FORA_DO_ESCOPO');
  const daemon=fs.readFileSync(PM+'/pm2.pid','utf8');const axon=require(require.resolve('pm2-axon',{paths:[PKG]})),Rpc=require(require.resolve('pm2-axon-rpc',{paths:[PKG]}));
  return new Promise((resolve,reject)=>{const socket=axon.socket('req'),client=new Rpc.Client(socket);let done=false;const timeout=setTimeout(()=>finish(Error('RPC_TIMEOUT')),20000);
    function finish(err,result){if(done)return;done=true;clearTimeout(timeout);socket.close();if(err||fs.readFileSync(PM+'/pm2.pid','utf8')!==daemon)return reject(Error('FISCAL_S3_PROD_RPC_FALHOU'));resolve(result);}
    socket.once('error',()=>finish(Error('RPC_ERROR')));socket.once('connect',()=>client.call(method,payload,finish));socket.connect(PM+'/rpc.sock');
  });
}

// Filho isolado. Nenhum valor secreto, URL assinada ou XML entra na saida.
async function storageWorker(mode,options){
  const fs=require('node:fs'),crypto=require('node:crypto'),mysql=require('mysql2/promise'),s3=require('@aws-sdk/client-s3');
  const fail=c=>{throw Error(c);},need=(v,c)=>{if(!v)fail(c);},sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const {env}=require('./src/config/env');let db;
  const result={mode,external_nsdocs_calls:0,database_writes:0,s3_writes:0,object_read_tested:false,signed_url_tested:false};
  try{
    need(!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','FISCAL_S3_PROD_HOOK_OU_TLS_INSEGURO');
    need(env.deploymentEnvironment==='production'&&Number(env.port)===8000&&env.dbHost==='gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com'&&env.dbName==='gestao_solicitacoes'&&env.dbSslCaFile,'FISCAL_S3_PROD_DB_CONFIG_DIFERENTE');
    db=await mysql.createConnection({host:env.dbHost,port:env.dbPort,user:env.dbUser,password:env.dbPassword,database:env.dbName,connectTimeout:10000,multipleStatements:false,ssl:{ca:fs.readFileSync(env.dbSslCaFile),verifyIdentity:true,rejectUnauthorized:true}});
    const q=async(sql,values=[])=>(await db.query({sql,values,timeout:10000}))[0];
    const [id]=await q('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');need(id?.uuid==='5ed4b970-009f-11f1-809c-0ad0e0c90c53'&&id.banco==='gestao_solicitacoes','FISCAL_S3_PROD_UUID_DIFERENTE');
    const tls=await q("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");need(tls.some(r=>r.Variable_name==='Ssl_cipher'&&r.Value)&&tls.some(r=>r.Variable_name==='Ssl_version'&&/^TLSv1\.[23]$/.test(r.Value)),'FISCAL_S3_PROD_TLS_OBRIGATORIO');
    await q('SET TRANSACTION READ ONLY');await db.beginTransaction();let refs=0,bad=0;
    const tables={fiscal_dfe_documents:['xml_storage_key','pdf_storage_key','danfe_storage_key'],fiscal_dfe_events:['raw_event_xml_storage_key'],fiscal_sync_logs:['raw_request_storage_key','raw_response_storage_key'],fiscal_accounting_batches:['zip_storage_key','report_storage_key'],fiscal_certificates:['certificate_s3_key_encrypted']};
    for(const[table,keys]of Object.entries(tables))for(const key of keys){
      const[r]=await q(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${key}\` IS NOT NULL AND LENGTH(TRIM(\`${key}\`))>0`);refs+=Number(r.total);
      if(key!=='certificate_s3_key_encrypted'){const[b]=await q(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${key}\` IS NOT NULL AND LENGTH(TRIM(\`${key}\`))>0 AND LEFT(\`${key}\`,5) <> ?`,['prod/']);bad+=Number(b.total);}
    }
    result.references=refs;result.references_outside_prod_prefix=bad;
    let schema;try{schema=await require('./scripts/fiscalVinculosProdSchema').state(async sql=>[await q(sql)]);}catch{fail('FISCAL_S3_PROD_SCHEMA_NAO_PRONTO');}
    need(schema.applied&&schema.structure_ok,'FISCAL_S3_PROD_SCHEMA_NAO_PRONTO');result.schema_checked=true;
  }finally{if(db){try{await db.rollback();}finally{await db.end();}}}
  if(mode==='db')return result;
  const storage=require('./src/modules/fiscal/services/fiscalS3Service'),role=require('./src/modules/fiscal/services/fiscalProdS3Role'),cfg=storage.getFiscalS3Config();
  need(cfg.bucket==='fluxy-fiscal-prod'&&cfg.region==='us-east-2'&&cfg.prefix==='prod','FISCAL_S3_PROD_CONFIG_ALVO_DIFERENTE');
  const provider=role.createCredentialsProvider(cfg),credentials=await provider();
  const {NodeHttpHandler}=require('@smithy/node-http-handler');
  const makeClient=credentials=>new s3.S3Client({region:'us-east-2',endpoint:'https://s3.us-east-2.amazonaws.com',credentials,maxAttempts:1,requestHandler:new NodeHttpHandler({connectionTimeout:5000,requestTimeout:10000})});
  const source=makeClient({accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,...(process.env.AWS_SESSION_TOKEN?{sessionToken:process.env.AWS_SESSION_TOKEN}:{})});
  const client=makeClient(credentials),bucket={Bucket:'fluxy-fiscal-prod',ExpectedBucketOwner:'992500432025'};
  try{
    const pub=await source.send(new s3.GetPublicAccessBlockCommand(bucket)),own=await source.send(new s3.GetBucketOwnershipControlsCommand(bucket));
    const version=await source.send(new s3.GetBucketVersioningCommand(bucket)),encryption=await source.send(new s3.GetBucketEncryptionCommand(bucket));
    const status=await source.send(new s3.GetBucketPolicyStatusCommand(bucket)),policy=JSON.parse((await source.send(new s3.GetBucketPolicyCommand(bucket))).Policy);
    const list=v=>Array.isArray(v)?v:[v];
    need(['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(k=>pub.PublicAccessBlockConfiguration?.[k]===true)&&status.PolicyStatus?.IsPublic===false,'FISCAL_S3_PROD_BUCKET_PUBLICO_OU_NAO_CONFERIDO');
    need(own.OwnershipControls?.Rules?.some(r=>r.ObjectOwnership==='BucketOwnerEnforced')&&version.Status==='Enabled'&&encryption.ServerSideEncryptionConfiguration?.Rules?.some(r=>r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm==='AES256'),'FISCAL_S3_PROD_PROTECOES_DIVERGENTES');
    need(list(policy.Statement).some(p=>p?.Effect==='Deny'&&(p.Principal==='*'||p.Principal?.AWS==='*')&&list(p.Action).includes('s3:*')&&['false',false].includes(p.Condition?.Bool?.['aws:SecureTransport'])&&Object.keys(p.Condition).length===1&&Object.keys(p.Condition.Bool).length===1&&['arn:aws:s3:::fluxy-fiscal-prod','arn:aws:s3:::fluxy-fiscal-prod/*'].every(r=>list(p.Resource).includes(r))),'FISCAL_S3_PROD_HTTPS_NAO_CONFERIDO');
    need((await client.send(new s3.GetBucketLocationCommand(bucket))).LocationConstraint==='us-east-2','FISCAL_S3_PROD_REGIAO_DIFERENTE');await client.send(new s3.ListObjectsV2Command({...bucket,Prefix:'prod/',MaxKeys:1}));result.role_and_bucket_checked=true;
    if(mode==='test'){
      need(options.allowWrite===true&&/^[a-f0-9-]{36}$/.test(options.nonce||''),'FISCAL_S3_PROD_TESTE_NAO_AUTORIZADO');
      const key='prod/_homologacao/'+options.nonce+'/probe.txt',body=Buffer.from('FLUXY FISCAL PROD STORAGE CHECK\n'+options.nonce+'\n'),digest=sha(body);
      async function get(){const r=await client.send(new s3.GetObjectCommand({...bucket,Key:key}));const chunks=[];let size=0;for await(const c of r.Body){const b=Buffer.from(c);size+=b.length;need(size<=4096,'FISCAL_S3_PROD_TESTE_TAMANHO_INVALIDO');chunks.push(b);}need(sha(Buffer.concat(chunks))===digest&&r.VersionId&&r.VersionId!=='null','FISCAL_S3_PROD_TESTE_HASH_OU_VERSAO_DIFERENTE');return r;}
      let object;
      try{object=await get();}catch(e){if(!['NoSuchKey','NotFound'].includes(e.name)||e.$metadata?.httpStatusCode!==404)throw e;}
      if(!object){
        try{await client.send(new s3.PutObjectCommand({...bucket,Key:key,Body:body,ContentType:'text/plain',ServerSideEncryption:'AES256',IfNoneMatch:'*',Metadata:{sha256:digest,purpose:'fluxy-fiscal-prod-homologacao'}}));result.s3_writes=1;}
        catch(e){if(e.$metadata?.httpStatusCode!==412)throw e;}
        object=await get();
      }
      result.object_read_tested=true;result.versioned_object=true;result.sha256=digest;
      const signed=await storage.getFiscalObjectSignedUrl(key,180,{attachment:true,filename:'fiscal-storage-probe.txt',contentType:'text/plain'}),url=new URL(signed);
      need(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='fluxy-fiscal-prod.s3.us-east-2.amazonaws.com'||url.hostname==='s3.us-east-2.amazonaws.com'&&url.pathname.startsWith('/fluxy-fiscal-prod/')),'FISCAL_S3_PROD_URL_FORA_DO_ALVO');
      const downloaded=await new Promise((resolve,reject)=>{const req=require('node:https').get(url,res=>{if(res.statusCode!==200){res.resume();reject(Error('FISCAL_S3_PROD_URL_RECUSADA'));return;}const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>4096){req.destroy();reject(Error('FISCAL_S3_PROD_URL_TAMANHO'));}else chunks.push(c);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',()=>reject(Error('FISCAL_S3_PROD_URL_LEITURA')));});req.setTimeout(10000,()=>req.destroy(Error('FISCAL_S3_PROD_URL_TIMEOUT')));req.on('error',()=>reject(Error('FISCAL_S3_PROD_URL_HTTP')));});
      need(sha(downloaded)===digest,'FISCAL_S3_PROD_URL_HASH_DIFERENTE');result.signed_url_tested=true;
    }
  }finally{client.destroy();source.destroy();}
  return result;
}
function worker(mode,env,options={}){check(!env.NODE_OPTIONS&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','FISCAL_S3_PROD_HOOK_OU_TLS_INSEGURO');const code=`(${storageWorker.toString()})(${JSON.stringify(mode)},${JSON.stringify(options)}).then(r=>console.log('FISCAL_S3_RESULT:'+JSON.stringify(r))).catch(e=>{console.error(/^FISCAL_S3_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'FISCAL_S3_PROD_PROBE_FALHOU_SEM_SEGREDOS');process.exitCode=1;});`;
  const r=cp.spawnSync(NODE,['-e',code],{cwd:BACKEND,env:{...clean(env),...PATCH},encoding:'utf8',timeout:120000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0){const safe=String(r.stderr||'').split(/\r?\n/).find(s=>/^FISCAL_S3_PROD_[A-Z0-9_]{1,120}$/.test(s));throw Error(safe||'FISCAL_S3_PROD_PROBE_FALHOU_SEM_SEGREDOS');}
  const lines=String(r.stdout||'').split(/\r?\n/).filter(s=>s.startsWith('FISCAL_S3_RESULT:'));check(lines.length===1,'FISCAL_S3_PROD_PROBE_SEM_RESULTADO');return JSON.parse(lines[0].slice(17));
}
function privateStateDir(){const st=fs.lstatSync(STATE);check(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===1000&&(st.mode&0o777)===0o700&&fs.realpathSync(STATE)===STATE,'FISCAL_S3_PROD_DIRETORIO_NAO_PRIVADO');}
function atomic(file,text,expected){check([ENVFILE,...DUMPS,STATE+'/estado.json'].includes(file),'FISCAL_S3_PROD_ESCRITA_FORA_DO_ESCOPO');if(file===STATE+'/estado.json')privateStateDir();const tmp=file+'.fluxy-tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,text,{mode:0o600,flag:'wx',flush:true});if(expected&&hash(fs.readFileSync(file))!==expected){fs.unlinkSync(tmp);throw Error('FISCAL_S3_PROD_ESCRITA_CONCORRENTE');}fs.renameSync(tmp,file);}
function loadState(){privateStateDir();const f=STATE+'/estado.json',st=privateFile(f);check(!(st.mode&0o077),'FISCAL_S3_PROD_ESTADO_NAO_PRIVADO');const s=JSON.parse(fs.readFileSync(f,'utf8'));check(s.schema===1&&s.version===VERSION&&canonical(s.files?.map(f=>f.path))===canonical([...DUMPS,ENVFILE]),'FISCAL_S3_PROD_ESTADO_INVALIDO');for(const file of s.files){const patch=file.path===ENVFILE?patchDotenv:patchDump;check(file.active===patch(file.original,PATCH)&&file.disabled===patch(file.original,DISABLED),'FISCAL_S3_PROD_CANDIDATO_DIVERGENTE');}return s;}
function validateFiles(s,which){for(const f of s.files){const st=privateFile(f.path),actual=hash(fs.readFileSync(f.path));const allowed=which?[f[which]]:[f.original,f.active,f.disabled];check(allowed.some(text=>hash(text)===actual),'FISCAL_S3_PROD_ARQUIVO_ALTERADO');if(which==='active'||which==='disabled'||actual!==hash(f.original))check(!(st.mode&0o077),'FISCAL_S3_PROD_ARQUIVO_NAO_PRIVADO');else check((st.mode&0o777)===f.originalMode,'FISCAL_S3_PROD_PERMISSAO_ALTERADA');}}
function scalarMatch(p,values){const e=initial(p.pid);return KEYS.every(k=>e[k]===values[k]);}
function candidates(){return[...DUMPS,ENVFILE].map(file=>{const st=privateFile(file),original=fs.readFileSync(file,'utf8'),patch=file===ENVFILE?patchDotenv:patchDump;return{path:file,original,active:patch(original,PATCH),disabled:patch(original,DISABLED),originalMode:st.mode&0o777};});}
function originalsUnchanged(files){for(const f of files){const st=privateFile(f.path);check(hash(fs.readFileSync(f.path))===hash(f.original)&&(st.mode&0o777)===f.originalMode,'FISCAL_S3_PROD_ARQUIVO_MUDOU_DURANTE_CONFERENCIA');}}
function health(){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:8000,path:'/health',timeout:3000},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});res.on('error',()=>resolve(false));});req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
async function stable(s,values){let good=0,last;for(let i=0;i<25;i++){const now=snapshot(false);same(s.before,now,true);const p=list().find(p=>p.name==='backend-solicitacoes');if(p.pid>1&&p.pm2_env.status==='online'&&scalarMatch(p,values)&&await health()){good=p.pid===last?good+1:1;last=p.pid;}else good=0;if(good>=5)return now;await new Promise(r=>setTimeout(r,2000));}throw Error('FISCAL_S3_PROD_NAO_ESTABILIZOU');}
function confirmations(){check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_FISCAL_S3_PROD'].every(k=>process.env[k]==='SIM'),'FISCAL_S3_PROD_CONFIRMACOES_AUSENTES');run('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);}
async function main(action){check(['diagnosticar','preparar','aplicar','conferir','testar-storage','voltar'].includes(action),'FISCAL_S3_PROD_MODO_INVALIDO');
  check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'&&fs.realpathSync(process.execPath)===NODE&&fs.realpathSync(process.cwd())===ROOT&&!process.env.NODE_OPTIONS,'FISCAL_S3_PROD_CONTEXTO_INVALIDO');
  check(fs.realpathSync(ROOT+'/.git')===ROOT+'/.git'&&git(['rev-parse','HEAD'])===VERSION&&git(['branch','--show-current'])==='main'&&!git(['status','--porcelain','--untracked-files=no']),'FISCAL_S3_PROD_CODIGO_DIFERENTE');
  check(!fs.existsSync(ROOT+'/.git/fluxy-nfe-prod-operacao.lock'),'FISCAL_S3_PROD_BACKEND_EM_OPERACAO');
  const manifest=JSON.parse(git(['show',VERSION+':ops/deploy/nfe-pedidos-producao-20261024.manifest.json']));for(const f of manifest.backend)check(hash(fs.readFileSync(ROOT+'/'+f.path))===f.sha256,'FISCAL_S3_PROD_FONTE_ALTERADA');
  const before=snapshot(!['voltar','conferir','aplicar'].includes(action)),p=list().find(p=>p.name==='backend-solicitacoes');
  if(action==='diagnosticar'){const files=candidates(),r=worker('preflight',initial(p.pid));same(before,snapshot());originalsUnchanged(files);console.log(JSON.stringify({outcome:'FISCAL_S3_PROD_DIAGNOSTICO_SOMENTE_LEITURA',...r,live_target_config:scalarMatch(p,PATCH),state_exists:fs.existsSync(STATE),file_candidates_validated:true,peers_nodes_env_dumps_preservados:true}));return;}
  const locks=[];
  try{
    for(const lock of[ROOT+'/.git/fluxy-nfe-prod-operacao.lock',ROOT+'/.git/fluxy-fiscal-s3-prod-operacao.lock']){fs.mkdirSync(lock,{mode:0o700});locks.push(lock);}
    if(action==='preparar'){
      check(!fs.existsSync(STATE),'FISCAL_S3_PROD_ESTADO_JA_EXISTE');const backendState=ROOT+'/.git/fluxy-nfe-prod-20261024/estado.json';privateFile(backendState);const proof=JSON.parse(fs.readFileSync(backendState,'utf8'));check(proof.phase==='backend_pronto'&&proof.version===VERSION,'FISCAL_S3_PROD_BACKEND_NAO_PRONTO');
      check(!scalarMatch(p,PATCH),'FISCAL_S3_PROD_CONFIG_JA_ALTERADA');const files=candidates(),result=worker('preflight',initial(p.pid));check(result.references===0,'FISCAL_S3_PROD_REFERENCIAS_EXISTENTES_NAO_CORTAR');
      same(before,snapshot());originalsUnchanged(files);fs.mkdirSync(STATE,{mode:0o700});atomic(STATE+'/estado.json',JSON.stringify({schema:1,version:VERSION,phase:'preparado',before,files,initialEnv:initial(p.pid),nested:structuredClone(p.pm2_env.env),nonce:crypto.randomUUID()},null,2));
      console.log('FISCAL_S3_PROD_PREPARADO. Backups/candidatos privados; .env/dumps/processos/S3 intactos.');return;
    }
    const s=loadState();same(s.before,before,true);
    if(action==='conferir'){
      const which=s.phase==='ativo'?'active':s.phase==='storage_suspenso'?'disabled':s.phase==='preparado'?'original':null;validateFiles(s,which);
      if(s.phase==='ativo'||s.phase==='storage_suspenso')check(p.pid>1&&scalarMatch(p,s.phase==='ativo'?PATCH:DISABLED),'FISCAL_S3_PROD_RUNTIME_DIVERGENTE');
      const result=s.phase==='ativo'?worker('preflight',initial(p.pid)):null;check(!result||result.references_outside_prod_prefix===0,'FISCAL_S3_PROD_REFERENCIAS_FORA_DO_PREFIXO');
      console.log(JSON.stringify({outcome:'FISCAL_S3_PROD_CONFERIDO',phase:s.phase,target_config:s.phase==='ativo',persistence:s.phase==='ativo'||s.phase==='storage_suspenso',object_test:s.test||null,peers_nodes_preservados:true,frontend_liberado:false}));return;
    }
    if(action==='testar-storage'){
      check(s.phase==='ativo'&&process.env.CONFIRM_FISCAL_S3_PROD_TEST_WRITE==='SIM','FISCAL_S3_PROD_TESTE_EXIGE_ATIVO_E_CONFIRMACAO');validateFiles(s,'active');check(scalarMatch(p,PATCH),'FISCAL_S3_PROD_RUNTIME_DIVERGENTE');
      const result=worker('test',initial(p.pid),{allowWrite:true,nonce:s.nonce});same(s.before,snapshot(),true);validateFiles(s,'active');
      check(result.references_outside_prod_prefix===0&&result.object_read_tested&&result.signed_url_tested,'FISCAL_S3_PROD_TESTE_INCOMPLETO');s.test=result;atomic(STATE+'/estado.json',JSON.stringify(s));
      console.log(JSON.stringify({outcome:'FISCAL_S3_PROD_OBJETO_TESTADO',...result,object_kept_for_audit:true,peers_nodes_env_dumps_preservados:true,frontend_liberado:false}));return;
    }
    confirmations();const active=action==='aplicar',values=active?PATCH:DISABLED,which=active?'active':'disabled';
    if(s.phase===(active?'ativo':'storage_suspenso')){validateFiles(s,which);check(p.pid>1&&scalarMatch(p,values),'FISCAL_S3_PROD_RUNTIME_DIVERGENTE');console.log('FISCAL_S3_PROD_REPLAY_SEM_REINICIO');return;}
    check(active?['preparado','aplicando'].includes(s.phase):['preparado','aplicando','ativo','suspendendo'].includes(s.phase),'FISCAL_S3_PROD_FASE_DIFERENTE');
    validateFiles(s,s.phase==='preparado'?'original':null);
    if(active){const probe=worker('preflight',s.initialEnv);check(probe.references===0,'FISCAL_S3_PROD_REFERENCIAS_EXISTENTES_NAO_CORTAR');}
    s.phase=active?'aplicando':'suspendendo';atomic(STATE+'/estado.json',JSON.stringify(s));
    const current=list().find(p=>p.name==='backend-solicitacoes');check(canonical(withoutFiscal({env:current.pm2_env.env}))===canonical(withoutFiscal({env:s.nested})),'FISCAL_S3_PROD_AMBIENTE_BASE_DIVERGENTE');
    if(current.pm2_env.status!=='stopped')await rpc('stopProcessId',current.pm_id,current.pm_id);
    const stopped=list().find(p=>p.name==='backend-solicitacoes');check(stopped.pid===0&&stopped.pm2_env.status==='stopped','FISCAL_S3_PROD_PARADA_NAO_CONFIRMADA');
    same(s.before,snapshot(false),true);
    if(active)check(worker('db',s.initialEnv).references===0,'FISCAL_S3_PROD_REFERENCIAS_APOS_PARADA');
    // Dump primario primeiro: um boot intermediario nao recebe um novo env de
    // PROD com variaveis fiscais de DEV vencendo via dump antigo.
    validateFiles(s,null);
    for(const f of s.files){const current=fs.readFileSync(f.path);check([f.original,f.active,f.disabled].some(text=>hash(text)===hash(current)),'FISCAL_S3_PROD_ARQUIVO_ALTERADO');atomic(f.path,f[which],hash(current));}validateFiles(s,which);
    await rpc('restartProcessId',restartPayload(current.pm_id,s.nested,values),current.pm_id,s.nested,values);
    await stable(s,values);validateFiles(s,which);
    if(active){const result=worker('preflight',initial(list().find(p=>p.name==='backend-solicitacoes').pid));check(result.references_outside_prod_prefix===0,'FISCAL_S3_PROD_REFERENCIAS_FORA_DO_PREFIXO');}
    same(s.before,snapshot(),true);s.phase=active?'ativo':'storage_suspenso';atomic(STATE+'/estado.json',JSON.stringify(s));
    console.log(JSON.stringify({outcome:active?'FISCAL_S3_PROD_CONFIGURADO':'FISCAL_S3_PROD_STORAGE_SUSPENSO',phase:s.phase,persistence:true,only_four_fiscal_variables_changed:true,dev_experience_daemon_nodes_preservados:true,frontend_liberado:false,object_tested:!!s.test?.signed_url_tested}));
  }finally{for(const lock of locks.reverse())fs.rmdirSync(lock);}
}
module.exports={main,patchDotenv,patchDump,restartPayload,same,canonical,hash,storageWorker,PATCH,DISABLED,KEYS};
if(require.main===module||process.argv[1]==='-')main(process.argv[2]).catch(e=>{console.error(/^FISCAL_S3_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'FISCAL_S3_PROD_INTERROMPIDO_SEM_EXIBIR_SEGREDOS');console.error('Nao contorne protecoes, publique frontend ou use o retorno antigo do backend depois deste corte. Envie somente esta saida.');process.exitCode=1;});
