'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const op=require('./atualizar-prod-reabertura-20261028.cjs');
test('snapshot COMPLETO reproduz PM2/proc do operador sem acesso ao host ou rede',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(__dirname+'/atualizar-prod-reabertura-20261028.cjs','utf8');
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
 const vm=require('node:vm'),source=fs.readFileSync(__dirname+'/atualizar-prod-reabertura-20261028.cjs','utf8');
 const call=source.split(/\r?\n/).find(line=>line.trim().startsWith('heap4096(e.node_args,'));assert(call,'Chamada real do snapshot deve ser exercitada.');
 function actual(raw,metadata='--max-old-space-size=4096'){
  vm.runInNewContext(call,{heap4096:op.heap4096,e:{node_args:['--max-old-space-size=4096']},p:{pid:2050},env:{node_args:metadata},fs:{readFileSync:(file,encoding)=>{assert.equal(file,'/proc/2050/cmdline');assert.equal(encoding,'utf8');return raw;}}});
 }
 assert.doesNotThrow(()=>actual('node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js\0\0\0'));
 assert.doesNotThrow(()=>actual('/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node\0--max-old-space-size=4096\0/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js\0'));
 assert.throws(()=>actual('titulo desconhecido\0'));
 assert.throws(()=>actual('node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js\0','--max-old-space-size=2304'));
});
function snap(){return{daemon:'42',persisted:[['dump','hash']],apps:[
 {name:'backend-solicitacoes',pid:50,restarts:3,env:'prod-env',envFile:'prod-file',node:'prod',policy:'prod4096'},
 {name:'backend-dev',pid:60,restarts:2,env:'dev-env',envFile:'dev-file',node:'dev',policy:'dev'},
 {name:'fluxy-experience-api',pid:70,restarts:0,env:'exp-env',envFile:'exp-file',node:'experience',policy:'experience'}]};}
test('caso real: titulo PM2 oculta argv, mas configuracao e metadado do filho mantem4096',()=>{
 const title='node /home/ubuntu/sistema-gestao-solicitacoes-main/backend/server.js';
 op.heap4096(['--max-old-space-size=4096'],[title],{node_args:'--max-old-space-size=4096'});
 op.heap4096(['--max-old-space-size=4096'],[title],{node_args:'["--max-old-space-size=4096"]'});
 for(const env of [{},{node_args:'--max-old-space-size=2304'},{node_args:'--max-old-space-size=4096 --max-old-space-size=4096'},{node_args:'--max-old-space-size=4096',NODE_OPTIONS:'--max-old-space-size=1024'}])assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],[title],env));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['titulo desconhecido'],{node_args:'--max-old-space-size=4096'}));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=2304'],{node_args:'--max-old-space-size=4096'}));
 assert.throws(()=>op.heap4096(['--max-old-space-size=4096'],['--max-old-space-size=4096'],{node_args:'--max-old-space-size=2304'}));
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
 const env=Object.fromEntries(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_REABERTURA_PROD'].map(k=>[k,'SIM']));op.confirmations(env);for(const k of Object.keys(env))assert.throws(()=>op.confirmations({...env,[k]:'NAO'}));
 op.automaticOff({NSDOCS_V2_ENABLED:'false'},{NSDOCS_V2_FIXTURES_ENABLED:false});for(const v of ['true','1',true])assert.throws(()=>op.automaticOff({NSDOCS_V2_ENABLED:v}));
 assert.throws(()=>op.automaticOff({ALLOW_SCHEMA_MIGRATIONS:'true'}));assert.throws(()=>op.automaticOff({NODE_TLS_REJECT_UNAUTHORIZED:'0'}));
});

const root=path.resolve(__dirname,'../..');
const gitBlob=(ref,p)=>{try{return cp.execFileSync('git',['show',ref+':'+p],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{return null;}};
// Em producao o runtime e um overlay legado ou decimal; manifesto valida a
// release publicada, enquanto sourceCheck do instalador valida o overlay em uso.
const read=p=>process.env.REABERTURA_QA_COMMIT?gitBlob(process.env.REABERTURA_QA_COMMIT,p):Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
function manifest(){return JSON.parse(read(op.MANIFEST));}
test('manifesto fechado real: bytes Git, bases conhecidas e unica funcao modificada',()=>{
 const m=manifest(),names=[...m.files.filter(f=>f.sha256!==f.old_sha256).map(f=>f.path),...op.EXTRA,op.MANIFEST];
 op.inventory(m,names,read,p=>gitBlob(op.BASE,p));
 for(const p of ['backend/.env','backend/migrations/novo.js','frontend/src/App.jsx','backend/src/routes.js'])assert.throws(()=>op.inventory(m,[...names,p],read,p=>gitBlob(op.BASE,p)));
 for(const delta of [{sql:1},{migrations:1},{heap_mib:2304},{runtime_files:2},{base:'outra'},{variants:[]}])assert.throws(()=>op.inventory({...m,...delta},names,read,p=>gitBlob(op.BASE,p)));
 assert.throws(()=>op.inventory(m,names,p=>Buffer.concat([read(p),Buffer.from('X')]),p=>gitBlob(op.BASE,p)));
 for(const v of m.variants){
  const before=gitBlob(v.head,op.RUNTIME),after=op.patchGuard(before,read(op.RUNTIME));
  assert.equal(op.hash(before),v.before);assert.equal(op.hash(after),v.after);
  const a=op.guard(before.toString()),b=op.guard(after.toString());
  assert.equal(before.toString().slice(0,a.a),after.toString().slice(0,b.a));
  assert.equal(before.toString().slice(a.b),after.toString().slice(b.b));
  assert.equal(b.text,op.guard(read(op.RUNTIME).toString()).text);
  assert.equal(before.includes(Buffer.from("require('../utils/decimalCompras')")),after.includes(Buffer.from("require('../utils/decimalCompras')")));
 }
 assert.throws(()=>op.patchGuard(Buffer.from('desconhecido'),read(op.RUNTIME)));
 assert.throws(()=>op.guard(read(op.RUNTIME).toString()+op.guard(read(op.RUNTIME).toString()).text));
});
test('variantes legada e precisao rodam casos reais de excluidos sem banco externo; baseline reproduz o defeito',()=>{
 const childEnvironment={...process.env,NODE_ENV:'test'};delete childEnvironment.NODE_TEST_CONTEXT;
 const runner=String.raw`
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
 const input=JSON.parse(fs.readFileSync(0,'utf8')),target=path.resolve('backend/src/services/pedidoCompraService.js'),decimal=path.resolve('backend/src/utils/decimalCompras.js');
 const raw=fs.readFileSync,exists=fs.existsSync,load=Module._load;
 fs.readFileSync=function(p,enc,...args){if(typeof p==='string'&&path.resolve(p)===target)return enc?input.source:Buffer.from(input.source);return raw.call(this,p,enc,...args);};
 fs.existsSync=function(p){return typeof p==='string'&&path.resolve(p)===decimal||exists.call(this,p);};
 const dm={exports:{}};vm.runInNewContext(input.decimal,{module:dm,BigInt});
 Module._load=function(request,...rest){return request==='../src/utils/decimalCompras'?dm.exports:load.call(this,request,...rest);};
 require('./backend/scripts/validarPedidoReaberturaTitulosExcluidos.js');`;
 const unique=[op.HEADS[0],op.BASE];
 for(const head of unique){
  const before=gitBlob(head,op.RUNTIME),decimal=gitBlob(op.BASE,'backend/src/utils/decimalCompras.js').toString();
  const out=cp.spawnSync(process.execPath,['--require','./backend/scripts/helpers/semRedeQa.js','-e',runner],{cwd:root,encoding:'utf8',timeout:60000,
   input:JSON.stringify({source:op.patchGuard(before,read(op.RUNTIME)).toString(),decimal}),env:childEnvironment});
  assert.equal(out.status,0,out.stdout+'\n'+out.stderr);assert.match(out.stdout,/(?:#|ℹ) pass 3\b/);
 }
 const baseline=cp.spawnSync(process.execPath,['--require','./backend/scripts/helpers/semRedeQa.js','-e',runner],{cwd:root,encoding:'utf8',timeout:60000,
  input:JSON.stringify({source:gitBlob(op.HEADS[0],op.RUNTIME).toString(),decimal:gitBlob(op.BASE,'backend/src/utils/decimalCompras.js').toString()}),env:childEnvironment});
 assert.equal(baseline.status,1);assert.match(baseline.stdout,/(?:#|ℹ) fail 3\b/);assert.match(baseline.stdout,/REABERTURA_EXIGE_APROVACAO_GEO/);
});
test('QA antes do unico restart; retomada nunca emite segundo restart',async()=>{
 const events=[],baseline=snap(),io={qa:()=>events.push('qa'),baseline:()=>baseline,save:(s,p)=>{s.phase=p;events.push(p);},restart:allow=>events.push(allow),ready:()=>events.push('ready')};
 const s={phase:'arquivos_prontos'};await op.finish(s,io);assert.deepEqual(events,['qa','reiniciando',true,'ready','aplicado']);assert.deepEqual(s.restart_before,baseline);
 events.length=0;await op.finish({phase:'reiniciando'},io);assert.deepEqual(events,[false,'ready','aplicado']);
 events.length=0;await assert.rejects(op.finish({phase:'arquivos_prontos'},{...io,qa:()=>{throw Error('QA_FALHOU');}}),/QA_FALHOU/);assert.deepEqual(events,[]);
 const lost={phase:'arquivos_prontos'},calls=[];const uncertain={...io,restart:allow=>{calls.push(allow);throw Error('RESPOSTA_PERDIDA');}};
 await assert.rejects(op.finish(lost,uncertain));assert.equal(lost.phase,'reiniciando');await assert.rejects(op.finish(lost,uncertain));assert.deepEqual(calls,[true,false]);
});
test('instalacao e retomada reais em fixture: falha parcial nao libera fonte desconhecida nem altera outros bytes',()=>{
 const vm=require('node:vm'),text=read(op.SELF).toString(),runtime='/home/ubuntu/sistema-gestao-solicitacoes-main/'+op.RUNTIME;
 const before=gitBlob(op.HEADS[0],op.RUNTIME),after=op.patchGuard(before,read(op.RUNTIME));
 let stored=Buffer.from(before),writes=0;
 const fakeFs={existsSync:p=>p===runtime,lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1}),readFileSync:()=>stored,
  writeFileSync:(p,b,o)=>{assert(p.startsWith(runtime+'.tmp-'));assert.equal(o.mode,0o644);stored=b;writes++;},renameSync:(from,to)=>{assert.equal(to,runtime);}};
 const sandbox={module:{exports:{}},require:n=>n==='node:fs'?fakeFs:n==='node:crypto'?require(n):{},process:{argv:['node','qa']},Buffer};vm.runInNewContext(text,sandbox);
 const fixture=sandbox.module.exports,s={files:[{path:op.RUNTIME,old_sha256:op.hash(before),sha256:op.hash(after),mode:0o644}]};
 fixture.install(s,()=>read(op.RUNTIME));assert.equal(op.hash(stored),op.hash(after));assert.equal(writes,1);
 fixture.install(s,()=>read(op.RUNTIME));assert.equal(writes,1);
 stored=Buffer.from('DIVERGENTE');assert.throws(()=>fixture.install(s,()=>read(op.RUNTIME)));assert.equal(writes,1);
});
test('instalador sem SQL, migracao, captura, Git pull/merge/reset ou PM2 global',()=>{
 const text=read(op.SELF).toString();
 assert(!/require\([^\n]*(?:models|mysql2|sequelize|src\/app)/.test(text));
 assert(!/git\(\['(?:merge|pull|reset|checkout|clean|add|commit)'/.test(text));
 assert(!/CLI,\s*['"](?:save|resurrect|update|delete|kill|reload)['"]/.test(text));
 assert(!/--update-env|--node-args|\b(?:npm|npx)\b/.test(text));
 assert(!op.FILES.some(p=>/migrations|Schema|models|package\.json/.test(p)));
 assert.match(text,/CLI,'restart',String\(initial\.id\)/);assert.match(text,/O_EXCL\|fs.constants.O_NOFOLLOW/);
 assert.match(text,/check\(allowStart,'RESTART_PENDENTE_CONFERENCIA'\)/);
 assert.equal((text.match(/http\.get\(/g)||[]).length,1);assert.match(text,/path:'\/health'/);
 assert.match(text,/HEAD_OU_INDEX_MUDOU/);assert.match(text,/FONTE_FORA_ESCOPO_MUDOU/);
});
