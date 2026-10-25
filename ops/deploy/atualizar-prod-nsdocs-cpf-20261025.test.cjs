'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const op=require('./atualizar-prod-nsdocs-cpf-20261025.cjs'),root=path.resolve(__dirname,'../..');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend',PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const STATE=ROOT+'/.git/fluxy-nsdocs-cpf-prod-20261025',PLAN=PRIVATE+'/historical-8e0a4179-506a-4670-88a2-d9079728e263.json';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const version='a'.repeat(40),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'nsdocs-cpf-prod-20261025.manifest.json')));
const old=new Map(manifest.files.map(f=>[f.path,cp.execFileSync('git',['show',op.BASE+':'+f.path],{cwd:root})]));
const target=new Map([...manifest.files,...manifest.qa].map(f=>[f.path,fs.readFileSync(path.join(root,f.path))]));
target.set('ops/deploy/nsdocs-cpf-prod-20261025.manifest.json',Buffer.from(JSON.stringify(manifest)));
function fixture(){
 const files=new Map(),meta=new Map(),dirs=new Set([PRIVATE]),fds=new Map(),calls=[],logs=[];let ino=1,fd=1,head=op.OLD,dirty=false,failQa=false,changePlan=false,failRestore=false;
 const put=(p,b,mode=0o600)=>{files.set(p,Buffer.from(b));meta.set(p,{uid:1000,mode,nlink:1,ino:ino++,dev:1});};
 const ps=[['backend-solicitacoes',BACKEND,NODE,101],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',102],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',103]]
 .map(([name,cwd,node,pid],i)=>({name,pid,pm_id:i,pm2_env:{name,status:'online',pm_cwd:cwd,pm_exec_path:cwd+(i===2?'/src/server.js':'/server.js'),exec_mode:'fork_mode',exec_interpreter:node,watch:false,env:{PORT:String(8000+i)}}}));
 put('/home/ubuntu/.pm2/pm2.pid','90');put(PLAN,'PLANO_INTACTO');put(PRIVATE+'/history.jsonl','HISTORICO_INTACTO');put(PRIVATE+'/credentials.json','CREDENCIAL_INTACTA');put(PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json','COMPLEMENTO_INTACTO');
 for(const p of ['/usr/bin/node',DAEMON,...ps.map(p=>p.pm2_env.exec_interpreter),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'])put(p,'FICTICIO_'+p);
 for(const p of ps)put(p.pm2_env.pm_cwd+'/.env','SEGREDO_FICTICIO_NAO_EXIBIR');for(const [p,b]of old)put(ROOT+'/'+p,b,0o644);
 const stat=p=>{if(dirs.has(p))return {uid:1000,mode:0o700,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
  assert(files.has(p),'arquivo '+p);return {...meta.get(p),size:files.get(p).length,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false};};
 const io={constants:fs.constants,realpathSync:p=>p,existsSync:p=>files.has(p)||dirs.has(p),lstatSync:stat,statSync:stat,
  readFileSync(p,encoding){let b;if(/^\/proc\/\d+\/environ$/.test(p)){const app=ps.find(x=>p===`/proc/${x.pid}/environ`);assert(app);b=Buffer.from('PORT='+app.pm2_env.env.PORT+'\0DB_PASSWORD=SEGREDO_FICTICIO_NAO_EXIBIR\0');}
   else b=files.get(p);assert(b,p);return encoding?b.toString():Buffer.from(b);},
  readlinkSync(p){if(p==='/proc/90/exe')return DAEMON;const a=ps.find(x=>p.startsWith(`/proc/${x.pid}/`));assert(a);return p.endsWith('/exe')?a.pm2_env.exec_interpreter:a.pm2_env.pm_cwd;},
  mkdirSync:p=>{assert(!dirs.has(p));dirs.add(p);},rmdirSync:p=>{assert(dirs.delete(p));},
  openSync(p,flags,mode){if(files.has(p)&&flags&fs.constants.O_EXCL){const e=Error('ocupado');e.code='EEXIST';throw e;}if(!files.has(p))put(p,'',mode);fds.set(++fd,p);return fd;},
  fstatSync:f=>stat(fds.get(f)),closeSync:f=>{assert(fds.delete(f));},
  unlinkSync:p=>{assert(files.delete(p));meta.delete(p);},
  writeFileSync(p,b,options){if(typeof p==='number'){files.set(fds.get(p),Buffer.from(b));return;}assert(options.flag==='wx');assert(!files.has(p));put(p,b,options.mode);},
  renameSync(a,b){assert(files.has(a));if(failRestore&&b===ROOT+'/'+op.FILES[1])throw Error('RETORNO_INTERROMPIDO_FICTICIO');files.set(b,files.get(a));meta.set(b,meta.get(a));files.delete(a);meta.delete(a);if(b.startsWith(BACKEND+'/'))dirty=true;}
 };
 const output=(b,o)=>({status:0,stdout:o.encoding===null?Buffer.from(b):String(b)});
 const child={spawnSync(bin,args,o){calls.push({bin,args});
  if(bin==='/usr/bin/git'){
   const a=args[0]==='--no-pager'?args.slice(4):args;
   if(a[0]==='branch')return output('main',o);if(a[0]==='fetch'||a[0]==='merge-base')return output('',o);
   if(a[0]==='rev-parse')return output(a[1]==='origin/main'?version:head,o);
   if(a[0]==='status')return output(dirty?' M fonte':'',o);
   if(a[0]==='show'){const i=a[1].indexOf(':'),ref=a[1].slice(0,i),p=a[1].slice(i+1);return output((ref===version?target:old).get(p),o);}
   if(a[0]==='diff'){if(a.includes(':(exclude)backend/src/generated/navegacaoFonteUnica.cjs')||a.includes('--diff-filter=D'))return output('',o);
    if(a.includes('--cached'))return output('',o);
    const changed=op.FILES.filter(p=>op.hash(files.get(ROOT+'/'+p))!==manifest.files.find(f=>f.path===p).sha256);
    return output(a.length===2?(dirty?changed.join('\n'):''):[...manifest.files.map(f=>f.path),op.QA,'ops/deploy/metadata.cjs'].join('\n'),o);}
   if(a[0]==='merge'){head=version;for(const [p,b]of target)put(ROOT+'/'+p,b,0o644);dirty=false;return output('',o);}throw Error('GIT_NAO_PREVISTO');
  }
  if(bin===DAEMON){assert.deepEqual(JSON.parse(JSON.stringify(args)),['/usr/lib/node_modules/pm2/bin/pm2','jlist']);return output(JSON.stringify(ps),o);}
  if(bin==='/usr/bin/systemctl'){assert.deepEqual(JSON.parse(JSON.stringify(args)),['is-active','--quiet','fluxy-prod-db-backup.timer']);return output('',o);}
  assert.equal(bin,NODE);assert.equal(args[0],'--test');assert.equal(o.env.DEPLOYMENT_ENV,undefined);
  assert(!Object.keys(o.env).some(k=>k.startsWith('CONFIRM_')||k.startsWith('AWS_')||k.startsWith('DB_')));
  if(changePlan)put(typeof changePlan==='string'?changePlan:PLAN,'ALTERACAO_CONCORRENTE');return failQa?{status:1,stdout:'',stderr:'SEGREDO_FICTICIO_NAO_EXIBIR'}:output('QA OK',o);
 }};
 const http={get(_o,callback){const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data','{"ok":true}');res.emit('end');});return req;}};
 const processMock={platform:'linux',arch:'x64',pid:900,version:'v24.22.1',execPath:NODE,getuid:()=>1000,cwd:()=>ROOT,argv:['node','fixture'],env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_NSDOCS_PROD_CPF_UPDATE:'SIM'}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'atualizar-prod-nsdocs-cpf-20261025.cjs'),'utf8'),{module:mod,Buffer,process:processMock,console:{log:s=>logs.push(String(s))},require:n=>n==='node:fs'?io:n==='node:child_process'?child:n==='node:http'?http:require(n)});
 return {op:mod.exports,files,meta,ps,calls,logs,process:processMock,put,state:()=>JSON.parse(files.get(STATE+'/estado.json')),failQa:v=>failQa=v,changePlan:v=>changePlan=v,failRestore:v=>failRestore=v};
}
test('preparar/aplicar/conferir preservam processos/env/dumps/plano/journal sem restart e permitem replay',async()=>{
 const f=fixture(),before=new Map(f.files);await f.op.main('preparar',version);assert.equal(f.state().phase,'preparado');await f.op.main('conferir');
 await f.op.main('aplicar');assert.equal(f.state().phase,'aplicado');await f.op.main('aplicar');await f.op.main('conferir');
 for(const [p,b]of before)if(!p.startsWith(BACKEND+'/src/'))assert.deepEqual(f.files.get(p),b,p);
 assert.deepEqual(f.ps.map(x=>x.pid),[101,102,103]);assert.equal(f.meta.get(STATE+'/estado.json').mode,0o600);
 assert(!f.calls.some(c=>c.args.includes('restart')||c.args.includes('reset')||c.args.includes('--update-env')));
 assert(!f.logs.join('\n').includes('SEGREDO_FICTICIO'));
});
test('captura ativa impede preparacao; nao remove lock pertencente a outro processo',async()=>{
 const f=fixture(),lock=PRIVATE+'/query.lock';f.put(lock,'OUTRO_PID');await assert.rejects(f.op.main('preparar',version));assert.equal(f.files.get(lock).toString(),'OUTRO_PID');
 assert(!f.files.has(PRIVATE+'/historical-plan.lock'));assert(!f.calls.some(c=>c.args[0]==='merge'));
});
test('flag ausente e QA falho bloqueiam; retorno restaura apenas4fontes e guarda progresso',async()=>{
 const f=fixture();await f.op.main('preparar',version);delete f.process.env.CONFIRM_NSDOCS_PROD_CPF_UPDATE;
 await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'preparado');f.process.env.CONFIRM_NSDOCS_PROD_CPF_UPDATE='SIM';
 f.failQa(true);await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'aplicando');f.failQa(false);
 const plan=Buffer.from(f.files.get(PLAN));await f.op.main('voltar');await f.op.main('conferir');assert.equal(f.state().phase,'retornado');
 for(const [p,b]of old)assert.deepEqual(f.files.get(ROOT+'/'+p),b);assert.deepEqual(f.files.get(PLAN),plan);
});
test('alteracao concorrente do plano ou processo impede confirmar aplicado',async()=>{
 const f=fixture();await f.op.main('preparar',version);f.changePlan(true);await assert.rejects(f.op.main('aplicar'));assert.notEqual(f.state().phase,'aplicado');
 const p=fixture();await p.op.main('preparar',version);p.ps[1].pid=999;await assert.rejects(p.op.main('aplicar'));
});
test('inventario recusa frontend, fonte extra e hash adulterado',()=>{
 const names=[...manifest.files.map(f=>f.path),op.QA],read=p=>target.get(p);
 op.inventory(manifest,names,read,p=>old.get(p));
 assert.throws(()=>op.inventory(manifest,[...names,'frontend/src/App.jsx'],read,p=>old.get(p)));
 assert.throws(()=>op.inventory(manifest,[...names,'backend/src/app.js'],read,p=>old.get(p)));
 assert.throws(()=>op.inventory(manifest,names,p=>p===op.FILES[0]?Buffer.from('ADULTERADO'):read(p),p=>old.get(p)));
});

test('progresso do complemento e credencial tambem sao protegidos durante QA',async()=>{
 for(const file of ['complement-c456781c-4393-468b-858f-dbf220d8f215.json','credentials.json']){
  const f=fixture();await f.op.main('preparar',version);f.changePlan(PRIVATE+'/'+file);
  await assert.rejects(f.op.main('aplicar'),/PROGRESSO_MUDOU/);assert.notEqual(f.state().phase,'aplicado');
 }
});

test('retorno interrompido entre arquivos retoma e replay nao muda dados ou processos',async()=>{
 const f=fixture();await f.op.main('preparar',version);await f.op.main('aplicar');f.failRestore(true);
 await assert.rejects(f.op.main('voltar'),/RETORNO_INTERROMPIDO/);assert.equal(f.state().phase,'retornando');
 assert.deepEqual(f.files.get(ROOT+'/'+op.FILES[0]),old.get(op.FILES[0]));
 assert.deepEqual(f.files.get(ROOT+'/'+op.FILES[1]),target.get(op.FILES[1]));
 f.failRestore(false);await f.op.main('voltar');await f.op.main('conferir');await f.op.main('voltar');
 assert.equal(f.state().phase,'retornado');for(const [p,b]of old)assert.deepEqual(f.files.get(ROOT+'/'+p),b);
 assert.deepEqual(f.ps.map(x=>x.pid),[101,102,103]);
 assert.equal(f.files.get(PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json').toString(),'COMPLEMENTO_INTACTO');
});
