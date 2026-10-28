'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const op=require('./precisao-compras-prod-20261028.cjs');
test('snapshot COMPLETO reproduz PM2/proc do operador sem acesso ao host ou rede',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(__dirname+'/precisao-compras-prod-20261028.cjs','utf8');
 const home='/home/ubuntu',backend=home+'/sistema-gestao-solicitacoes-main/backend',node=home+'/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',daemon='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
 function actual({configured='--max-old-space-size=4096',metadata='--max-old-space-size=4096',options='',badDev=false}={}){
  const rows=[['backend-solicitacoes',2050,backend,node],['backend-dev',710,home+'/sistema-gestao-solicitacoes-dev/backend',home+'/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],['fluxy-experience-api',713,home+'/fluxy-experience/api',home+'/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']];
  const files=new Map([[home+'/.pm2/pm2.pid','42']]),links=new Map([['/proc/42/exe',daemon]]);
  const apps=rows.map(([name,pid,cwd,exe],id)=>{links.set('/proc/'+pid+'/exe',badDev&&id===1?'outro-node':exe);links.set('/proc/'+pid+'/cwd',cwd);files.set(cwd+'/.env','NSDOCS_V2_ENABLED=false');files.set('/proc/'+pid+'/cmdline','node '+cwd+'/server.js\0\0');files.set('/proc/'+pid+'/environ',id===0?'node_args='+metadata+'\0NODE_OPTIONS='+options+'\0':'');
   return{name,pid,pm_id:id,pm2_env:{pm_cwd:cwd,pm_exec_path:cwd+'/server.js',exec_interpreter:exe,status:'online',exec_mode:'fork_mode',node_args:id===0?[configured]:[],restart_time:id===0?9:0}};});
  for(const f of ['/usr/bin/node',daemon,...rows.map(r=>r[3]),home+'/.pm2/dump.pm2',home+'/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'])files.set(f,'FIXTURE:'+f);
  const fakeFs={readFileSync:(file,encoding)=>{assert(files.has(file),'Leitura fora da fixture: '+file);return encoding?files.get(file):Buffer.from(files.get(file));},readlinkSync:file=>{assert(links.has(file));return links.get(file);},lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1,mode:0o100600,uid:1000})};
  const fakeCp={spawnSync:(bin,args)=>{assert.equal(bin,daemon);assert.deepEqual(Array.from(args),['/usr/lib/node_modules/pm2/bin/pm2','jlist']);return{status:0,stdout:JSON.stringify(apps)};}};
  function requireFixture(name){if(name==='node:fs')return fakeFs;if(name==='node:child_process')return fakeCp;if(name===backend+'/node_modules/dotenv')return{parse:()=>({NSDOCS_V2_ENABLED:'false'})};if(name==='node:crypto')return require(name);if(name==='node:http')return{};throw Error('REQUIRE_FORA_FIXTURE');}
  const sandbox={module:{exports:{}},require:requireFixture,process:{argv:['node','qa']},Buffer,console};vm.runInNewContext(source+'\nmodule.exports.snapshotQa=snapshot;',sandbox);return sandbox.module.exports.snapshotQa();
 }
 const result=actual();assert.equal(result.apps[0].pid,2050);assert.equal(result.apps[0].restarts,9);assert.equal(result.apps[1].pid,710);assert.equal(result.apps[2].pid,713);
 for(const config of [{configured:'--max-old-space-size=2304'},{metadata:''},{metadata:'--max-old-space-size=2304'},{options:'--max-old-space-size=1024'},{badDev:true}])assert.throws(()=>actual(config));
});
test('chamada REAL do snapshot preserva titulo PM2 de argv unico recebido do operador',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(__dirname+'/precisao-compras-prod-20261028.cjs','utf8');
 const call=source.split(/\r?\n/).find(line=>line.trim().startsWith('heap4096(e.node_args,'));assert(call,'Chamada real do snapshot deve ser exercitada.');
 function actual(raw,metadata='--max-old-space-size=4096'){
  vm.runInNewContext(call,{heap4096:op.heap4096,e:{node_args:['--max-old-space-size=4096']},p:{pid:2050},env:{node_args:metadata},fs:{readFileSync:(file,encoding)=>{assert.equal(file,'/proc/2050/cmdline');assert.equal(encoding,'utf8');return raw;}}});
 }
 assert.doesNotThrow(()=>actual('node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js\0\0\0'));
 assert.doesNotThrow(()=>actual('/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node\0--max-old-space-size=4096\0/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js\0'));
 assert.throws(()=>actual('titulo desconhecido\0'));
 assert.throws(()=>actual('node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js\0','--max-old-space-size=2304'));
});
function manifest(){return{base:op.BASE,release_parent:op.RELEASE_PARENT,runtime_files:9,business_data_writes:0,migration:op.MIGRATION,heap_mib:4096,
 files:op.FILES.map(p=>({path:p,sha256:op.hash(p),old_sha256:op.hash('old:'+p)})),extra:op.EXTRA.map(p=>({path:p,sha256:op.hash(p)}))};}
function snap(){return{daemon:'42',persisted:[['dump','hash']],apps:[
 {name:'backend-solicitacoes',pid:50,restarts:3,env:'prod-env',envFile:'prod-file',node:'prod',policy:'prod4096'},
 {name:'backend-dev',pid:60,restarts:2,env:'dev-env',envFile:'dev-file',node:'dev',policy:'dev'},
 {name:'fluxy-experience-api',pid:70,restarts:0,env:'exp-env',envFile:'exp-file',node:'experience',policy:'experience'}]};}
test('inventario fechado rejeita extras, exclusoes, adulteracao e escrita de banco',()=>{
 const names=[...op.FILES,...op.EXTRA,op.MANIFEST];op.inventory(manifest(),names,p=>p,p=>'old:'+p);
 for(const p of ['backend/.env','frontend/src/App.jsx','backend/migrations/novo.js','backend/src/routes.js','backend/package.json','backend/src/controllers/HomeBlocosController.js'])assert.throws(()=>op.inventory(manifest(),[...names,p],p=>p,p=>'old:'+p));
 assert.throws(()=>op.inventory(manifest(),names.slice(1),p=>p,p=>'old:'+p));assert.throws(()=>op.inventory(manifest(),names,p=>p+'bad',p=>'old:'+p));assert.throws(()=>op.inventory(manifest(),names,p=>p,()=>null));
 for(const delta of [{migration:'outra.js'},{business_data_writes:1},{heap_mib:2304},{runtime_files:10},{base:'other'},{release_parent:'other'}])assert.throws(()=>op.inventory({...manifest(),...delta},names,p=>p,p=>'old:'+p));
});
test('caso real: titulo PM2 oculta argv, mas configuracao e metadado do filho mantem4096',()=>{
 const title='node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js';
 op.heap4096(['--max-old-space-size=4096'],[title],{node_args:'--max-old-space-size=4096'});
 op.heap4096(['--max-old-space-size=4096'],[title],{node_args:'["--max-old-space-size=4096"]'});
 for(const env of [{},{node_args:'--max-old-space-size=2304'},{node_args:'--max-old-space-size=4096 --max-old-space-size=4096'},{node_args:'--max-old-space-size=4096',NODE_OPTIONS:'--max-old-space-size=1024'}])assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],[title],env));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['titulo desconhecido'],{node_args:'--max-old-space-size=4096'}));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=2304'],{node_args:'--max-old-space-size=4096'}));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=4096'],{node_args:'--max-old-space-size=2304'}));
});
test('correcao e filha direta do backend MAIN publicado, sem mistura de historico DEV',()=>{
 op.releaseChain(op.RELEASE_PARENT);assert.throws(()=>op.releaseChain('other'));op.releaseChain(op.BASE);
});

test('env auxiliar remove somente IPC/cluster do PM2 e conserva todas as configuracoes da aplicacao',()=>{
 const initial={NODE_CHANNEL_FD:'3',NODE_CHANNEL_SERIALIZATION_MODE:'json',NODE_UNIQUE_ID:'1',
  DB_PASSWORD:'VALOR_PRIVADO_QA',PORT:'8000',DEPLOYMENT_ENV:'production',NODE_OPTIONS:'--inspect',node_args:'--max-old-space-size=4096'};
 const before=structuredClone(initial),clean=op.childEnv(initial);
 for(const key of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'])assert(!Object.hasOwn(clean,key));
 for(const key of ['DB_PASSWORD','PORT','DEPLOYMENT_ENV','NODE_OPTIONS','node_args'])assert.equal(clean[key],initial[key]);
 assert.deepEqual(initial,before);assert.notEqual(clean,initial);
});

test('Node auxiliar real inicia com env saneado sem IPC invalido; nenhum banco ou arquivo de aplicacao',()=>{
 const initial={PATH:process.env.PATH,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),NODE_CHANNEL_FD:'99999',NODE_CHANNEL_SERIALIZATION_MODE:'json',NODE_UNIQUE_ID:'7',QA_MARKER:'AUXILIAR_OK'};
 const r=cp.spawnSync(process.execPath,['-e',"process.stdout.write(process.env.QA_MARKER);"],{env:op.childEnv(initial),encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
 assert.equal(r.error,undefined);assert.equal(r.status,0);assert.equal(r.stdout,'AUXILIAR_OK');assert.equal(initial.NODE_CHANNEL_FD,'99999');
});

test('chamadas REAIS de preflight e schema nao herdam IPC; leitura/snapshot continua bruta',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(__dirname+'/precisao-compras-prod-20261028.cjs','utf8');
 const daemon='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',node='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
 const envText='NODE_CHANNEL_FD=3\0NODE_CHANNEL_SERIALIZATION_MODE=json\0NODE_UNIQUE_ID=1\0DB_PASSWORD=PRIVADO_QA\0PORT=8000\0node_args=--max-old-space-size=4096\0';
 const children=[];const sandbox={module:{exports:{}},process:{argv:['node','qa'],env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_COMPRAS_PRECISAO_PROD_SCHEMA:'SIM'}},Buffer,console,require:name=>{
  if(name==='node:fs')return{readFileSync:p=>p.endsWith('/pm2.pid')?'42':p==='/proc/50/environ'?envText:(()=>{throw Error('FS_FORA_FIXTURE');})(),readlinkSync:()=>daemon};
  if(name==='node:child_process')return{spawnSync:(bin,args,options)=>{
   if(bin===daemon)return{status:0,stdout:JSON.stringify([{name:'backend-solicitacoes',pid:50}])};
   assert.equal(bin,node);children.push({args:Array.from(args),env:options.env});
   for(const key of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'])assert(!Object.hasOwn(options.env,key));
   assert.equal(options.env.DB_PASSWORD,'PRIVADO_QA');assert.equal(options.env.node_args,'--max-old-space-size=4096');
   if(args[0]==='-e')return{status:0,stdout:''};
   return{status:0,stdout:JSON.stringify({outcome:'COMPRAS_PRECISAO_SCHEMA_PROD',applied:true,structure_ok:true,pending:[],business_data_writes:0,financial_data_writes:0,external_calls:0})};
  }};
  if(name==='node:crypto')return require(name);if(name==='node:http')return{};throw Error('IMPORT_FORA_FIXTURE');
 }};
 vm.runInNewContext(source+'\nmodule.exports.preflightQa=preflightEnvironment;module.exports.schemaQa=schema;module.exports.procEnvQa=procEnv;',sandbox);
 const app=sandbox.module.exports;assert.equal(app.procEnvQa(50).NODE_CHANNEL_FD,'3');
 app.preflightQa();app.schemaQa('--aplicar');app.schemaQa('--conferir');assert.equal(children.length,3);
 assert.equal(children[1].env.CONFIRM_COMPRAS_PRECISAO_PROD_SCHEMA,'SIM');
 assert.equal(app.procEnvQa(50).NODE_CHANNEL_FD,'3','Nao alterar ambiente lido do processo real');
});

test('falhas de criacao/sinal possuem codigo sanitizado sem erro, args ou stderr bruto',()=>{
 const secret='SEGREDO_QA_NAO_IMPRIMIR';
 assert.equal(op.spawnFailure({error:{code:'E2BIG',message:secret}}),'SUBPROCESSO_E2BIG');
 assert.equal(op.spawnFailure({status:null,signal:'SIGABRT',stderr:secret}),'SUBPROCESSO_SIGABRT');
 assert.equal(op.spawnFailure({status:1,stderr:secret}),'COMANDO_EXIT_1');
 assert.equal(op.spawnFailure({error:{code:secret,message:secret},signal:secret}),'COMANDO_FALHOU');
});
test('heap4096 deve estar configurado e presente no processo real, sem conflitos',()=>{
 op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=4096','script.js'],{});
 op.heap4096('--max_old_space_size 4096',['--max_old_space_size','4096','script.js'],{});
 for(const args of [[],['--max-old-space-size=2304'],['--max-old-space-size=4096','--max_old_space_size=4096'],['--max-old-space-size-percentage=50'],['--max-heap-size=4096']])assert.throws(()=>op.heap4096(args,['--max-old-space-size=4096'],{}));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['script.js'],{}));assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=4096'],{NODE_OPTIONS:'--max-old-space-size=1024'}));
});
test('somente um restart PROD, sem alterar DEV/Experience, argumentos, env, daemon ou dumps',()=>{
 const a=snap(),b=structuredClone(a);b.apps[0].pid=51;b.apps[0].restarts++;op.same(a,b,'one');assert.throws(()=>op.same(a,b));
 for(const change of [s=>s.apps[1].pid++,s=>s.apps[2].pid++,s=>s.apps[0].restarts++,s=>s.apps[0].env='other',s=>s.apps[0].envFile='other',s=>s.apps[0].policy='heap2304',s=>s.apps[0].node='node-global',s=>s.persisted[0][1]='other',s=>s.daemon='other']){const c=structuredClone(b);change(c);assert.throws(()=>op.same(a,c,'one'));}
});
test('preflight admite reinicios automaticos anteriores em PROD, preservando tudo mais',()=>{
 const a=snap(),b=structuredClone(a);b.apps[0].pid=99;b.apps[0].restarts=12;op.same(a,b,'refresh');assert.throws(()=>op.same(a,b,'one'));
 b.apps[0].env='changed';assert.throws(()=>op.same(a,b,'refresh'));
});
test('retomada nao emite segundo restart se primeiro ja ocorreu',()=>{
 assert(op.restartNeeded({pid:10,restarts:3},{pid:10,restarts:3}));assert.equal(op.restartNeeded({pid:10,restarts:3},{pid:11,restarts:4}),false);
 assert.throws(()=>op.restartNeeded({pid:10,restarts:3},{pid:11,restarts:5}));assert.throws(()=>op.restartNeeded({pid:10,restarts:3},{pid:11,restarts:3}));
});
test('confirmacoes e automatico OFF sao obrigatorios',()=>{
 const env=Object.fromEntries(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_COMPRAS_PRECISAO_PROD_SCHEMA'].map(k=>[k,'SIM']));op.confirmations(env);for(const k of Object.keys(env))assert.throws(()=>op.confirmations({...env,[k]:'NAO'}));
 op.automaticOff({NSDOCS_V2_ENABLED:'false'},{NSDOCS_V2_FIXTURES_ENABLED:false});for(const v of ['true','1',true])assert.throws(()=>op.automaticOff({NSDOCS_V2_ENABLED:v}));
 assert.throws(()=>op.automaticOff({ALLOW_SCHEMA_MIGRATIONS:'true'}));assert.throws(()=>op.automaticOff({NODE_TLS_REJECT_UNAUTHORIZED:'0'}));
});
test('QA e schema antecedem restart; falhas bloqueiam transicao e retomada nao pede restart',async()=>{
 const events=[],baseline=snap(),s={phase:'arquivos_prontos'},io={qa:()=>events.push('qa'),migrate:()=>events.push('schema'),baseline:()=>{events.push('baseline');return baseline;},save:(s,p)=>{s.phase=p;events.push(p);},restart:allow=>events.push('restart:'+allow),ready:()=>events.push('ready')};
 await op.finish(s,io);assert.deepEqual(events,['qa','baseline','schema_pendente','schema','baseline','schema_pronto','baseline','reiniciando','restart:true','ready','aplicado']);assert.deepEqual(s.restart_before,baseline);
 events.length=0;await op.finish({phase:'reiniciando'},io);assert.deepEqual(events,['restart:false','ready','aplicado']);
 events.length=0;await op.finish({phase:'schema_pendente'},io);assert.deepEqual(events,['schema','baseline','schema_pronto','baseline','reiniciando','restart:true','ready','aplicado']);
 events.length=0;await assert.rejects(op.finish({phase:'arquivos_prontos'},{...io,qa:()=>{throw Error('QA_FAIL');}}),/QA_FAIL/);assert.deepEqual(events,[]);
 events.length=0;await assert.rejects(op.finish({phase:'schema_pendente'},{...io,migrate:()=>{throw Error('SCHEMA_FAIL');}}),/SCHEMA_FAIL/);assert.deepEqual(events,[]);
 events.length=0;await assert.rejects(op.finish({phase:'schema_pronto'},{...io,baseline:()=>{throw Error('ENV_CHANGED');}}),/ENV_CHANGED/);assert.deepEqual(events,[]);
});
test('restart de resultado incerto conserva fase, e retomada apenas confere',async()=>{
 const events=[],s={phase:'schema_pronto'},io={baseline:snap,save:(s,p)=>{s.phase=p;events.push(p);},restart:allow=>{events.push(allow);throw Error(allow?'resposta perdida':'reinicio pendente');},ready:()=>events.push('ready')};
 await assert.rejects(op.finish(s,io),/resposta perdida/);assert.equal(s.phase,'reiniciando');
 await assert.rejects(op.finish(s,io),/reinicio pendente/);assert.deepEqual(events,['reiniciando',true,false]);
});
test('bases revisadas antes/depois de compras-query sao aceitas e qualquer outra diferenca e bloqueada',()=>{
 const root=path.resolve(__dirname,'../..');
 for(const head of op.STARTING_HEADS){const diff=cp.execFileSync('git',['diff','--name-only',head,op.BASE,'--','backend'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);op.startingHead(head,diff);}
 assert.throws(()=>op.startingHead('desconhecida',[]));
 assert.throws(()=>op.startingHead(op.BASE,['backend/src/services/rhService.js']));
});
test('aplicador nao carrega aplicacao/banco, nao chama captura e nao persiste PM2',()=>{
 const text=fs.readFileSync(__dirname+'/precisao-compras-prod-20261028.cjs','utf8');
 assert(!/require\([^\n]*(?:models|mysql2|sequelize|server\.js|src\/app)/.test(text));assert(!/\b(?:npm|npx)\b|--update-env|--node-args|reset --hard|git clean/.test(text));
 assert(!/CLI,\s*['"](?:save|resurrect|update|delete|kill|reload)['"]/.test(text));assert.match(text,/CLI,'restart',String\(initial\.id\)/);
 assert(!/run\([^\n]*nsdocsProd/.test(text));assert(text.includes("['scripts/comprasPrecisaoProdSchema.cjs',mode]"));assert.deepEqual(op.FILES.filter(p=>p.includes('/migrations/')),['backend/migrations/'+op.MIGRATION]);assert(text.includes("check(allowStart,'RESTART_PENDENTE_CONFERENCIA')"));assert.equal((text.match(/http\.get\(/g)||[]).length,1);assert.match(text,/path:'\/health'/);
 assert.match(text,/O_EXCL\|fs.constants.O_NOFOLLOW/);assert.match(text,/git\(\['merge','--ff-only',s.version\]\)/);assert(!/git\(\['pull'/.test(text));
});
test('manifesto real coincide com os bytes Git normalizados e base imutavel',()=>{
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST),'utf8'));
 const read=p=>Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
 const oldRead=p=>{try{return cp.execFileSync('git',['show',op.BASE+':'+p],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{return null;}};
 op.inventory(m,[...m.files.filter(f=>f.sha256!==f.old_sha256).map(f=>f.path),...op.EXTRA,op.MANIFEST],read,oldRead);
});
