'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const op=require('./configurar-fiscal-s3-prod-20261024.cjs');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend',PM='/home/ubuntu/.pm2',STATE=ROOT+'/.git/fluxy-fiscal-s3-prod-20261024';
const PKG='/usr/lib/node_modules/pm2',NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',VERSION='b5e34d7bb12fab45a81f5f2927c6bd15dfa0cbe2';
const DROP='/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf';
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'nfe-pedidos-producao-20261024.manifest.json')));
const dump=()=>[{name:'backend-solicitacoes',pm_cwd:BACKEND,pm_exec_path:BACKEND+'/server.js',exec_interpreter:NODE,env:{JWT_SECRET:'QA_SECRET',PORT:'8000'},FISCAL_S3_BUCKET:'fluxy-fiscal-dev'},
  {name:'backend-dev',exec_interpreter:'/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',env:{AWS_SECRET_ACCESS_KEY:'QA_DEV_SECRET'}},
  {name:'fluxy-experience-api',exec_interpreter:'/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',env:{JWT_SECRET:'QA_EXPERIENCE_SECRET'}}];
test('quatro chaves .env somente, CRLF/export/comentarios/segredos preservados, duplicidade rejeitada',()=>{
  const original='# QA\r\nJWT_SECRET="QA_SECRET"\r\nexport FISCAL_S3_BUCKET = "fluxy-fiscal-dev" # old\r\nFISCAL_SEFAZ_ENABLED=true\r\n';
  const next=op.patchDotenv(original,op.PATCH);assert(next.includes('JWT_SECRET="QA_SECRET"\r\n'));assert(next.includes('FISCAL_SEFAZ_ENABLED=true\r\n'));
  for(const[k,v]of Object.entries(op.PATCH))assert(next.includes(k+'='+v+'\r\n'));
  assert.equal(op.patchDotenv(next,op.PATCH),next);assert.throws(()=>op.patchDotenv('FISCAL_S3_BUCKET=x\nFISCAL_S3_BUCKET=y\n',op.PATCH));
});
test('dumps alteram apenas quatro campos PROD, inclusive env; outras entradas exatas',()=>{
  const before=dump(),after=JSON.parse(op.patchDump(JSON.stringify(before),op.PATCH));
  assert.deepEqual(after.slice(1),before.slice(1));assert.equal(after[0].env.JWT_SECRET,'QA_SECRET');assert.equal(after[0].exec_interpreter,NODE);
  for(const[k,v]of Object.entries(op.PATCH)){assert.equal(after[0][k],v);assert.equal(after[0].env[k],v);}
  const off=JSON.parse(op.patchDump(JSON.stringify(before),op.DISABLED));assert.equal(off[0].FISCAL_S3_BUCKET,'');assert(!op.DISABLED.FISCAL_S3_BUCKET.includes('dev'));
  assert.throws(()=>op.patchDump(JSON.stringify([before[0],before[0],before[2]]),op.PATCH));
});
test('RPC de restart so permite patch PROD ou suspensao e nao troca Node/outros parametros',()=>{
  const env={JWT_SECRET:'QA_SECRET',PORT:'8000'},p=op.restartPayload(0,env,op.PATCH);
  assert.deepEqual(Object.keys(p.env.current_conf).sort(),[...op.KEYS,'env'].sort());assert.equal(p.env.current_conf.env.JWT_SECRET,'QA_SECRET');
  assert(!JSON.stringify(p).includes('exec_interpreter'));assert.deepEqual(env,{JWT_SECRET:'QA_SECRET',PORT:'8000'});
  assert.throws(()=>op.restartPayload(1,env,{...op.PATCH,FISCAL_S3_BUCKET:'fluxy-fiscal-dev'}));
});
function fixture(){
  const files=new Map(),dirs=new Set(),modes=new Map(),logs=[],calls=[],rpcCalls=[];let refs=0,badRefs=0,failProbe=false,healthy=true,nonceCount=0,race=false,peerEdit=false,stopCreatesRef=false;
  const put=(p,b,mode=0o600)=>{files.set(p,Buffer.from(b));modes.set(p,mode);};
  const ps=[['backend-solicitacoes',BACKEND,NODE,100],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',200],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',300]].map(([name,cwd,node,pid],i)=>({name,pid,pm_id:i,pm2_env:{name,pm_cwd:cwd,pm_exec_path:cwd+(i===2?'/src/server.js':'/server.js'),exec_interpreter:node,exec_mode:'fork_mode',status:'online',watch:false,env:{JWT_SECRET:'QA_SECRET',PORT:i?'8001':'8000',DEPLOYMENT_ENV:i?'development':'production',AWS_ACCESS_KEY_ID:'QA_ACCESS',AWS_SECRET_ACCESS_KEY:'QA_AWS_SECRET',FISCAL_S3_BUCKET:'fluxy-fiscal-dev'}}}));
  const envBytes=p=>Buffer.from(Object.entries(p.pm2_env.env).map(([k,v])=>k+'='+v).join('\0')+'\0pm_uptime='+p.pid+'\0');
  for(const f of ['/usr/bin/node',DAEMON,...ps.map(p=>p.pm2_env.exec_interpreter),'/etc/systemd/system/pm2-ubuntu.service',PKG+'/lib/Utility.js',PKG+'/lib/God/ActionMethods.js'])put(f,'QA_'+f);
  put(PKG+'/package.json',JSON.stringify({version:'6.0.14'}));put(PM+'/pm2.pid','90\n');
  put(DROP,'[Service]\nExecStart=\nExecStart='+DAEMON+' '+PKG+'/bin/pm2 resurrect\nExecStop=\nExecStop='+DAEMON+' '+PKG+'/bin/pm2 kill\nExecReload=\nExecReload='+DAEMON+' '+PKG+'/bin/pm2 reload all\nEnvironment="PATH='+path.posix.dirname(DAEMON)+':/usr/bin:/bin"\n',0o644);
  for(const p of ps)put(p.pm2_env.pm_cwd+'/.env','JWT_SECRET=QA_SECRET\nAWS_SECRET_ACCESS_KEY=QA_AWS_SECRET\nFISCAL_S3_BUCKET=fluxy-fiscal-dev\nFISCAL_SEFAZ_ENABLED=true\n',p.name==='backend-solicitacoes'?0o640:0o600);
  for(const p of [PM+'/dump.pm2',PM+'/dump.pm2.bak'])put(p,JSON.stringify(dump()));
  put(ROOT+'/.git/fluxy-nfe-prod-20261024/estado.json',JSON.stringify({phase:'backend_pronto',version:VERSION}));
  for(const f of manifest.backend)put(ROOT+'/'+f.path,fs.readFileSync(path.resolve(__dirname,'../..',f.path)),0o644);
  const fakeFs={
    readFileSync(p,encoding){let b;if(/^\/proc\/\d+\/environ$/.test(p)){const proc=ps.find(x=>p===`/proc/${x.pid}/environ`);assert(proc);b=envBytes(proc);}else b=files.get(p);if(!b)throw Error('QA_FILE_MISSING '+p);return encoding?b.toString():Buffer.from(b);},
    readlinkSync(p){if(p==='/proc/90/exe')return DAEMON;const a=ps.find(x=>p.startsWith(`/proc/${x.pid}/`));assert(a);return p.endsWith('/exe')?a.pm2_env.exec_interpreter:a.pm2_env.pm_cwd;},
    realpathSync:p=>p,statSync:p=>({mode:modes.get(p)||0o600,uid:1000}),
    lstatSync(p){assert(files.has(p)||dirs.has(p)||p===PM+'/rpc.sock');return{isFile:()=>files.has(p),isDirectory:()=>dirs.has(p),isSocket:()=>p===PM+'/rpc.sock',isSymbolicLink:()=>false,nlink:1,uid:p===DROP?0:1000,mode:0o100000|(modes.get(p)||0o600)};},
    existsSync:p=>dirs.has(p)||files.has(p),mkdirSync(p){assert(!dirs.has(p));dirs.add(p);modes.set(p,0o700);},rmdirSync(p){assert(dirs.delete(p));modes.delete(p);},
    writeFileSync(p,b,opts){assert.equal(opts.flag,'wx');assert(!files.has(p));put(p,b,opts.mode);if(race&&p.startsWith(PM+'/dump.pm2.fluxy-tmp-')){race=false;put(PM+'/dump.pm2','QA_CONCURRENT_DUMP');}},
    renameSync(a,b){assert(files.has(a));put(b,files.get(a),modes.get(a));files.delete(a);modes.delete(a);},unlinkSync(p){assert(files.delete(p));modes.delete(p);}
  };
  const fakeCp={spawnSync(bin,args,opts){calls.push({bin,args,env:opts.env});const out=s=>({status:0,stdout:s});
    if(bin==='/usr/bin/git'){const a=args.slice(4);if(a[0]==='rev-parse')return out(VERSION);if(a[0]==='branch')return out('main');if(a[0]==='status')return out('');if(a[0]==='show')return out(JSON.stringify(manifest));throw Error('QA_GIT_FORA_DO_ESCOPO');}
    if(bin===DAEMON){assert.equal(args[1],'jlist');return out(JSON.stringify(ps));}
    if(bin==='/usr/bin/systemctl'){
      if(args.includes('show'))return out('Id=pm2-ubuntu.service\nActiveState=active\nUnitFileState=enabled\nUser=ubuntu\nType=forking\nMainPID=90\nPIDFile='+PM+'/pm2.pid\nDropInPaths='+DROP+'\nExecStart={ path='+DAEMON+' ; argv[]='+DAEMON+' '+PKG+'/bin/pm2 resurrect ; }');
      assert.equal(args.at(-1),'fluxy-prod-db-backup.timer');return out('');
    }
    assert.equal(bin,NODE);assert.equal(args[0],'-e');for(const[k,v]of Object.entries(op.PATCH))assert.equal(opts.env[k],v);
    const mode=/\}\)\("(preflight|db|test)",/.exec(args[1])?.[1];assert(mode);
    if(failProbe&&mode!=='db')return{status:1,stdout:'',stderr:'QA_AWS_SECRET'};
    return out('FISCAL_S3_RESULT:'+JSON.stringify({mode,references:refs,references_outside_prod_prefix:badRefs,role_and_bucket_checked:mode!=='db',s3_writes:mode==='test'?++nonceCount===1?1:0:0,object_read_tested:mode==='test',signed_url_tested:mode==='test'}));
  }};
  class Socket extends EventEmitter{connect(){queueMicrotask(()=>this.emit('connect'));}close(){}}
  const fakeAxon={socket:type=>{assert.equal(type,'req');return new Socket();}};
  const fakeRpc={Client:class{constructor(socket){this.socket=socket;}call(method,payload,cb){rpcCalls.push({method,payload});
    const p=ps[0];if(method==='stopProcessId'){assert.equal(payload,0);p.pid=0;p.pm2_env.status='stopped';if(stopCreatesRef)refs=1;}
    else{assert.equal(method,'restartProcessId');assert.equal(payload.id,0);const conf=payload.env.current_conf;
      assert.deepEqual(Object.keys(conf).sort(),[...op.KEYS,'env'].sort());Object.assign(p.pm2_env,structuredClone(conf));p.pid=1000+rpcCalls.length;p.pm2_env.status='online';
      if(peerEdit)ps[1].pm2_env.env.FISCAL_S3_BUCKET='QA_DEV_ALTERADO';}
    queueMicrotask(()=>cb(null,{}));}}};
  const req=n=>n==='node:fs'?fakeFs:n==='node:child_process'?fakeCp:n==='pm2-axon'?fakeAxon:n==='pm2-axon-rpc'?fakeRpc:n==='node:http'?{get(_opts,cb){const q=new EventEmitter();q.destroy=()=>{};queueMicrotask(()=>{const r=new EventEmitter();r.statusCode=healthy?200:500;cb(r);r.emit('data',JSON.stringify({ok:healthy}));r.emit('end');});return q;}}:require(n);
  req.resolve=n=>n;
  const fakeProcess={platform:'linux',arch:'x64',version:'v24.22.1',execPath:NODE,getuid:()=>1000,cwd:()=>ROOT,argv:['node','qa'],env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_FISCAL_S3_PROD:'SIM',CONFIRM_FISCAL_S3_PROD_TEST_WRITE:'SIM'}};
  const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'configurar-fiscal-s3-prod-20261024.cjs'),'utf8'),{module:mod,require:req,process:fakeProcess,Buffer,structuredClone,URL,console:{log:s=>logs.push(String(s))},setTimeout:(fn,ms)=>setTimeout(fn,ms===20000?20000:0),clearTimeout});
  return{operator:mod.exports,files,modes,ps,calls,rpcCalls,logs,process:fakeProcess,state:()=>JSON.parse(files.get(STATE+'/estado.json')),
    refs:n=>refs=n,badRefs:n=>badRefs=n,failProbe:v=>failProbe=v,health:v=>healthy=v,race:()=>race=true,editPeer:()=>peerEdit=true,createRefOnStop:()=>stopCreatesRef=true};
}
test('diagnostico nao escreve; preparar guarda privados sem tocar .env/dumps/processos',async()=>{
  const f=fixture(),before=new Map(f.files);await f.operator.main('diagnosticar');assert.equal(f.files.size,before.size);await f.operator.main('preparar');
  for(const[p,b]of before)assert.deepEqual(f.files.get(p),b,p);assert.equal(f.rpcCalls.length,0);assert.equal(f.state().phase,'preparado');assert.equal(f.modes.get(STATE+'/estado.json'),0o600);
  assert(!f.logs.join('\n').includes('QA_AWS_SECRET'));
});
test('aplicar altera so4 chaves PROD em tres arquivos e PM2; persiste, repete sem novo restart e testa objeto sob flag',async()=>{
  const f=fixture(),devEnv=Buffer.from(f.files.get(f.ps[1].pm2_env.pm_cwd+'/.env')),devDump=JSON.parse(f.files.get(PM+'/dump.pm2'))[1];
  await f.operator.main('preparar');await f.operator.main('aplicar');assert.equal(f.state().phase,'ativo');assert.deepEqual(f.rpcCalls.map(x=>x.method),['stopProcessId','restartProcessId']);
  assert.deepEqual(JSON.parse(f.files.get(PM+'/dump.pm2'))[1],devDump);assert.deepEqual(f.files.get(f.ps[1].pm2_env.pm_cwd+'/.env'),devEnv);
  assert.equal(f.ps[1].pid,200);assert.equal(f.ps[2].pid,300);for(const[k,v]of Object.entries(op.PATCH))assert.equal(f.ps[0].pm2_env.env[k],v);
  assert.equal(f.modes.get(BACKEND+'/.env'),0o600);await f.operator.main('aplicar');assert.equal(f.rpcCalls.length,2);
  await f.operator.main('testar-storage');assert(f.state().test.signed_url_tested);await f.operator.main('conferir');
  assert(!f.logs.join('\n').includes('QA_AWS_SECRET'));assert(f.logs.join('\n').includes('FISCAL_S3_PROD_CONFIGURADO'));
});
test('referencia existente, backup ausente, falha AWS e conflito de arquivo param sem tocar armazenamento/dumps',async()=>{
  const a=fixture();a.refs(1);await assert.rejects(a.operator.main('preparar'));assert.equal(a.rpcCalls.length,0);
  for(const failure of['backup','aws','file']){const f=fixture();await f.operator.main('preparar');const old=Buffer.from(f.files.get(PM+'/dump.pm2'));
    if(failure==='backup')delete f.process.env.CONFIRM_PROD_BACKUP;if(failure==='aws')f.failProbe(true);if(failure==='file')f.files.set(BACKEND+'/.env',Buffer.from('ALTERADO'));
    await assert.rejects(f.operator.main('aplicar'));assert.equal(f.rpcCalls.length,0);assert.deepEqual(f.files.get(PM+'/dump.pm2'),old);
  }
});
test('referencia apos parada e escrita concorrente nao sao sobrescritas; retorno suspende em vez de usar DEV',async()=>{
  const f=fixture();await f.operator.main('preparar');f.createRefOnStop();await assert.rejects(f.operator.main('aplicar'));assert.equal(f.rpcCalls.length,1);
  await f.operator.main('voltar');assert.equal(f.state().phase,'storage_suspenso');assert.equal(f.ps[0].pm2_env.env.FISCAL_S3_BUCKET,'');
  assert.equal(JSON.parse(f.files.get(PM+'/dump.pm2'))[0].FISCAL_S3_BUCKET,'');
  const a=fixture();await a.operator.main('preparar');a.race();await assert.rejects(a.operator.main('aplicar'));assert.equal(a.files.get(PM+'/dump.pm2').toString(),'QA_CONCURRENT_DUMP');
});
test('erro de peer bloqueia conclusao; teste de gravacao exige flag propria e nao reinicia',async()=>{
  const f=fixture();await f.operator.main('preparar');f.editPeer();await assert.rejects(f.operator.main('aplicar'));assert.notEqual(f.state().phase,'ativo');
  const a=fixture();await a.operator.main('preparar');await a.operator.main('aplicar');delete a.process.env.CONFIRM_FISCAL_S3_PROD_TEST_WRITE;
  await assert.rejects(a.operator.main('testar-storage'));assert.equal(a.rpcCalls.length,2);assert(!a.state().test);
});
function objectFixture(){
  const calls=[],sql=[],objects=new Map();let denied=false,wrongBody=false,wrongHost=false,versioned=true,httpCalls=0;
  const nonce='a1b2c3d4-1234-4567-89ab-a1b2c3d4e5f6',body=Buffer.from('FLUXY FISCAL PROD STORAGE CHECK\n'+nonce+'\n');
  const names=['GetPublicAccessBlockCommand','GetBucketOwnershipControlsCommand','GetBucketVersioningCommand','GetBucketEncryptionCommand','GetBucketPolicyStatusCommand','GetBucketPolicyCommand','GetBucketLocationCommand','ListObjectsV2Command','GetObjectCommand','PutObjectCommand'];
  const commands=Object.fromEntries(names.map(name=>[name,class{constructor(input){this.name=name;this.input=input;}}]));
  class Client{constructor(config){this.role=config.credentials.accessKeyId==='QA_ROLE';assert.equal(config.maxAttempts,1);assert.equal(config.endpoint,'https://s3.us-east-2.amazonaws.com');}
    async send(command){const{name,input:i}=command;calls.push({name,input:i,role:this.role});assert.equal(i.Bucket,'fluxy-fiscal-prod');assert.equal(i.ExpectedBucketOwner,'992500432025');
      if(name==='GetObjectCommand'){
        assert(this.role);if(denied){const e=Error('QA_SECRET_NAO_EXIBIR');e.name='AccessDenied';e.$metadata={httpStatusCode:403};throw e;}
        const o=objects.get(i.Key);if(!o){const e=Error('missing');e.name='NoSuchKey';e.$metadata={httpStatusCode:404};throw e;}
        return{VersionId:versioned?'QA_VERSION':null,Body:(async function*(){yield wrongBody?Buffer.from('ALTERADO'):o;})()};
      }
      if(name==='PutObjectCommand'){
        assert(this.role);assert.equal(i.Key,'prod/_homologacao/'+nonce+'/probe.txt');assert.equal(i.IfNoneMatch,'*');assert.equal(i.ServerSideEncryption,'AES256');assert.equal(i.ACL,undefined);
        assert.deepEqual(i.Body,body);assert.equal(i.Metadata.sha256,op.hash(body));
        if(objects.has(i.Key)){const e=Error('exists');e.$metadata={httpStatusCode:412};throw e;}objects.set(i.Key,Buffer.from(i.Body));return{VersionId:'QA_VERSION'};
      }
      return{
        GetPublicAccessBlockCommand:{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}},
        GetBucketOwnershipControlsCommand:{OwnershipControls:{Rules:[{ObjectOwnership:'BucketOwnerEnforced'}]}},GetBucketVersioningCommand:{Status:'Enabled'},
        GetBucketEncryptionCommand:{ServerSideEncryptionConfiguration:{Rules:[{ApplyServerSideEncryptionByDefault:{SSEAlgorithm:'AES256'}}]}},
        GetBucketPolicyStatusCommand:{PolicyStatus:{IsPublic:false}},GetBucketPolicyCommand:{Policy:JSON.stringify({Statement:[{Effect:'Deny',Principal:'*',Action:'s3:*',Resource:['arn:aws:s3:::fluxy-fiscal-prod','arn:aws:s3:::fluxy-fiscal-prod/*'],Condition:{Bool:{'aws:SecureTransport':'false'}}}]})},
        GetBucketLocationCommand:{LocationConstraint:'us-east-2'},ListObjectsV2Command:{}
      }[name];
    }destroy(){}}
  const connection={async query({sql:q}){sql.push(q);if(q.includes('server_uuid'))return[[{uuid:'5ed4b970-009f-11f1-809c-0ad0e0c90c53',banco:'gestao_solicitacoes'}]];
    if(q.startsWith('SHOW SESSION'))return[[{Variable_name:'Ssl_cipher',Value:'QA_TLS'},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]];
    if(q.startsWith('SELECT COUNT'))return[[{total:0}]];assert.equal(q,'SET TRANSACTION READ ONLY');return[[]];},async beginTransaction(){},async rollback(){},async end(){}};
  const req=n=>{
    if(n==='node:fs')return{readFileSync:()=>Buffer.from('QA_CA')};
    if(n==='mysql2/promise')return{createConnection:async options=>{assert(options.ssl.rejectUnauthorized&&options.ssl.verifyIdentity);assert.equal(options.multipleStatements,false);return connection;}};
    if(n==='@aws-sdk/client-s3')return{...commands,S3Client:Client};if(n==='@smithy/node-http-handler')return{NodeHttpHandler:class{}};
    if(n==='./src/config/env')return{env:{deploymentEnvironment:'production',port:8000,dbHost:'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',dbName:'gestao_solicitacoes',dbSslCaFile:'/qa/ca.pem'}};
    if(n==='./scripts/fiscalVinculosProdSchema')return{state:async()=>({applied:true,structure_ok:true})};
    if(n==='./src/modules/fiscal/services/fiscalProdS3Role')return{createCredentialsProvider:()=>async()=>({accessKeyId:'QA_ROLE',secretAccessKey:'QA_TEMP_SECRET',sessionToken:'QA_TEMP_TOKEN'})};
    if(n==='./src/modules/fiscal/services/fiscalS3Service')return{getFiscalS3Config:()=>({bucket:'fluxy-fiscal-prod',region:'us-east-2',prefix:'prod'}),getFiscalObjectSignedUrl:async(key,ttl,options)=>{
      assert.equal(ttl,180);assert(options.attachment);return'https://'+(wrongHost?'evil.invalid':'fluxy-fiscal-prod.s3.us-east-2.amazonaws.com')+'/'+key+'?X-Amz-Security-Token=QA_TEMP_TOKEN';}};
    if(n==='node:https')return{get(url,callback){httpCalls++;assert.equal(url.hostname,'fluxy-fiscal-prod.s3.us-east-2.amazonaws.com');const r=new EventEmitter();r.setTimeout=()=>{};r.destroy=()=>{};
      queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',body);res.emit('end');});return r;}};
    return require(n);
  };
  const fn=vm.runInNewContext('('+op.storageWorker.toString()+')',{require:req,process:{env:{AWS_ACCESS_KEY_ID:'QA_SOURCE',AWS_SECRET_ACCESS_KEY:'QA_SOURCE_SECRET'}},Buffer,URL});
  return{fn,nonce,calls,sql,objects,deny:()=>denied=true,wrongBody:()=>wrongBody=true,wrongHost:()=>wrongHost=true,noVersion:()=>versioned=false,httpCalls:()=>httpCalls};
}
test('worker real usa Put condicional/AES256, Get versionado e URL HTTPS sem exibir credenciais; replay nao grava outra versao',async()=>{
  const f=objectFixture(),a=await f.fn('test',{allowWrite:true,nonce:f.nonce}),b=await f.fn('test',{allowWrite:true,nonce:f.nonce});
  assert.equal(a.s3_writes,1);assert.equal(b.s3_writes,0);assert(a.object_read_tested&&a.signed_url_tested&&a.versioned_object);
  assert.equal(f.calls.filter(c=>c.name==='PutObjectCommand').length,1);assert.equal(f.httpCalls(),2);
  assert(!JSON.stringify([a,b]).includes('QA_TEMP_TOKEN'));assert(!JSON.stringify([a,b]).includes('QA_TEMP_SECRET'));
  assert(f.sql.every(q=>/^(SELECT|SHOW|SET TRANSACTION READ ONLY)/.test(q)));
});
test('worker nao faz fallback de Get403 para Put e recusa outro host, hash ou objeto sem versao',async()=>{
  const f=objectFixture();f.deny();await assert.rejects(f.fn('test',{allowWrite:true,nonce:f.nonce}));assert.equal(f.calls.filter(c=>c.name==='PutObjectCommand').length,0);
  const g=objectFixture();await assert.rejects(g.fn('test',{allowWrite:false,nonce:g.nonce}));assert.equal(g.objects.size,0);
  for(const failure of['wrongHost','wrongBody','noVersion']){const a=objectFixture();await a.fn('test',{allowWrite:true,nonce:a.nonce});a[failure]();await assert.rejects(a.fn('test',{allowWrite:true,nonce:a.nonce}));assert.equal(a.calls.filter(c=>c.name==='PutObjectCommand').length,1);}
});
