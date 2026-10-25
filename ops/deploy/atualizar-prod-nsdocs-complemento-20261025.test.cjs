'use strict';
// Operador real em FS/PM2/Git/HTTP simulados. Nao executa SSH, PM2 ou banco real.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const op=require('./atualizar-prod-nsdocs-complemento-20261025.cjs'),root=path.resolve(__dirname,'../..');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend',PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const STATE=ROOT+'/.git/fluxy-nsdocs-complemento-prod-20261025',PLAN=PRIVATE+'/historical-8e0a4179-506a-4670-88a2-d9079728e263.json';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const version='a'.repeat(40),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'nsdocs-complemento-prod-20261025.manifest.json')));
const old=new Map(manifest.backend.filter(f=>f.old_sha256).map(f=>[f.path,cp.execFileSync('git',['show',op.BASE+':'+f.path],{cwd:root})]));
const target=new Map(manifest.backend.map(f=>[f.path,fs.readFileSync(path.join(root,f.path))]));
target.set('ops/deploy/nsdocs-complemento-prod-20261025.manifest.json',Buffer.from(JSON.stringify(manifest)));
function fixture(){
 const files=new Map(),meta=new Map(),dirs=new Set([PRIVATE]),fds=new Map(),calls=[],logs=[],dirty=new Set();let ino=1,fd=1,head=op.BASE,failQa=false,changePlan=false,changeDb=false,breakReturn=false;
 const put=(p,b,mode=0o600)=>{files.set(p,Buffer.from(b));meta.set(p,{uid:1000,mode,nlink:1,ino:ino++,dev:1});};
 const ps=[['backend-solicitacoes',BACKEND,NODE,101],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',102],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',103]]
 .map(([name,cwd,node,pid],i)=>({name,pid,pm_id:i,pm2_env:{name,status:'online',pm_cwd:cwd,pm_exec_path:cwd+(i===2?'/src/server.js':'/server.js'),exec_mode:'fork_mode',exec_interpreter:node,watch:false,env:{PORT:String(8000+i)}}}));
 put('/home/ubuntu/.pm2/pm2.pid','90');put(PLAN,'PLANO_INTACTO');put(PRIVATE+'/history.jsonl','HISTORICO_INTACTO');put(PRIVATE+'/credentials.json','SEGREDO_FICTICIO');
 for(const p of ['/usr/bin/node',DAEMON,...ps.map(p=>p.pm2_env.exec_interpreter),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'])put(p,'FICTICIO_'+p);
 for(const p of ps)put(p.pm2_env.pm_cwd+'/.env','SEGREDO_FICTICIO');for(const [p,b]of old)put(ROOT+'/'+p,b,0o644);
 const stat=p=>{if(dirs.has(p))return {uid:1000,mode:0o700,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};assert(files.has(p),'arquivo '+p);return {...meta.get(p),size:files.get(p).length,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false};};
 const io={constants:fs.constants,realpathSync:p=>p,existsSync:p=>files.has(p)||dirs.has(p),lstatSync:stat,statSync:stat,
  readFileSync(p,encoding){let b;if(/^\/proc\/\d+\/environ$/.test(p)){const app=ps.find(x=>p===`/proc/${x.pid}/environ`);assert(app);b=Buffer.from('PORT='+app.pm2_env.env.PORT+'\0DB_PASSWORD=SEGREDO_FICTICIO\0');}else b=files.get(p);assert(b,p);return encoding?b.toString():Buffer.from(b);},
  readlinkSync(p){if(p==='/proc/90/exe')return DAEMON;const a=ps.find(x=>p.startsWith(`/proc/${x.pid}/`));assert(a);return p.endsWith('/exe')?a.pm2_env.exec_interpreter:a.pm2_env.pm_cwd;},
  mkdirSync:p=>{assert(!dirs.has(p));dirs.add(p);},rmdirSync:p=>{assert(dirs.delete(p));},
  openSync(p,flags,mode){if(files.has(p)&&flags&fs.constants.O_EXCL){const e=Error('ocupado');e.code='EEXIST';throw e;}if(!files.has(p))put(p,'',mode);fds.set(++fd,p);return fd;},
  fstatSync:f=>stat(fds.get(f)),closeSync:f=>{assert(fds.delete(f));},unlinkSync:p=>{assert(files.delete(p));meta.delete(p);},
  writeFileSync(p,b,options){if(typeof p==='number'){files.set(fds.get(p),Buffer.from(b));return;}assert(options.flag==='wx');assert(!files.has(p));put(p,b,options.mode);},
  renameSync(a,b){if(breakReturn&&b===ROOT+'/backend/src/modules/fiscal/services/fiscalDocumentService.js'){breakReturn=false;throw Error('QUEDA_RETORNO');}assert(files.has(a));files.set(b,files.get(a));meta.set(b,meta.get(a));files.delete(a);meta.delete(a);if(b.startsWith(BACKEND+'/'))dirty.add(b.slice(ROOT.length+1));if(a===ROOT+'/'+op.ENTRY)dirty.add(op.ENTRY);}
 };
 const output=(b,o)=>({status:0,stdout:o.encoding===null?Buffer.from(b):String(b)});
 const child={spawnSync(bin,args,o){calls.push({bin,args});
  if(bin==='/usr/bin/git'){
   const a=args[0]==='--no-pager'?args.slice(4):args;
   if(a[0]==='branch')return output('main',o);if(a[0]==='fetch'||a[0]==='merge-base')return output('',o);
   if(a[0]==='rev-parse')return output(a[1]==='origin/main'?version:head,o);
   if(a[0]==='status')return output([...dirty].map(p=>' M '+p).join('\n'),o);
   if(a[0]==='ls-tree')return output(old.has(a.at(-1))?a.at(-1):'',o);
   if(a[0]==='show'){const i=a[1].indexOf(':'),ref=a[1].slice(0,i),p=a[1].slice(i+1);return output((ref===version?target:old).get(p),o);}
   if(a[0]==='diff'){
    if(a.includes('--diff-filter=D')||a.includes('--cached'))return output('',o);
    return output(a.length===2?[...dirty].join('\n'):[...op.ALLOWED,'ops/deploy/metadata.cjs'].join('\n'),o);
   }
   if(a[0]==='merge'){head=version;for(const [p,b]of target)put(ROOT+'/'+p,b,0o644);dirty.clear();return output('',o);}throw Error('GIT_NAO_PREVISTO');
  }
  if(bin===DAEMON){assert.equal(args[0],'/usr/lib/node_modules/pm2/bin/pm2');if(args[1]==='jlist')return output(JSON.stringify(ps),o);
   assert.equal(args[1],'restart');assert.equal(args[2],'0');assert.equal(args.length,3);ps[0].pid+=10;return output('RESTART_OK',o);}
  if(bin==='/usr/bin/systemctl'){assert.deepEqual(Array.from(args),['is-active','--quiet','fluxy-prod-db-backup.timer']);return output('',o);}
  assert.equal(bin,NODE);
  if(args[0]==='-e'){
   assert(args[1].includes('withProdReadDatabase'));assert(!args[1].includes('migrateProd()'));assert(!args[1].includes('captureManually('));
   return output('NSDOCS_COMPLEMENTO_PROBE:'+JSON.stringify({schema_ok:true,source_documents:46,digest:(changeDb?'e':'d').repeat(64)}),o);
  }
  assert.equal(o.env.NODE_ENV,'test');assert(!Object.keys(o.env).some(k=>/^(?:CONFIRM_|AWS_|DB_)/.test(k)));
  if(changePlan)put(PLAN,'ALTERACAO_CONCORRENTE');return failQa?{status:1,stdout:'',stderr:'SEGREDO_FICTICIO'}:output('QA OK',o);
 }};
 const http={get(options,callback){assert.equal(options.port,8000);const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data','{"ok":true}');res.emit('end');});return req;}};
 const processMock={platform:'linux',arch:'x64',pid:900,version:'v24.22.1',execPath:NODE,getuid:()=>1000,cwd:()=>ROOT,argv:['node','fixture'],env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_NSDOCS_COMPLEMENTO_DEPLOY:'SIM'}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'atualizar-prod-nsdocs-complemento-20261025.cjs'),'utf8'),{module:mod,Buffer,process:processMock,setTimeout:fn=>{fn();},console:{log:s=>logs.push(String(s))},require:n=>n==='node:fs'?io:n==='node:child_process'?child:n==='node:http'?http:require(n)});
 return {op:mod.exports,files,meta,ps,calls,logs,process:processMock,put,state:()=>JSON.parse(files.get(STATE+'/estado.json')),failQa:v=>failQa=v,changePlan:v=>changePlan=v,changeDb:v=>changeDb=v,breakReturn:()=>breakReturn=true};
}

test('preparar nao atualiza checkout/processos; aplicar reinicia somente PROD e replay nao reinicia',async()=>{
 const f=fixture(),before=new Map(f.files);await f.op.main('preparar',version);assert.equal(f.state().phase,'preparado');await f.op.main('conferir');
 assert.deepEqual(f.ps.map(p=>p.pid),[101,102,103]);await f.op.main('aplicar');assert.equal(f.state().phase,'backend_pronto');await f.op.main('aplicar');await f.op.main('conferir');
 assert.deepEqual(f.ps.map(p=>p.pid),[111,102,103]);assert.equal(f.calls.filter(c=>c.args[1]==='restart').length,1);
 for(const [p,b]of before)if(!p.startsWith(BACKEND+'/src/')&&p!==ROOT+'/backend/package.json')assert.deepEqual(f.files.get(p),b,p);
 assert.equal(f.meta.get(STATE+'/estado.json').mode,0o600);assert(!f.logs.join('\n').includes('SEGREDO_FICTICIO'));
 assert(!f.calls.some(c=>c.args.some(a=>['save','update','resurrect','--update-env','reset','clean','install'].includes(a))));
});
test('lock ativo bloqueia deploy e nao remove bloqueio alheio',async()=>{
 const f=fixture(),lock=PRIVATE+'/query.lock';f.put(lock,'OUTRO_PID');await assert.rejects(f.op.main('preparar',version));assert.equal(f.files.get(lock).toString(),'OUTRO_PID');assert(!f.files.has(PRIVATE+'/historical-plan.lock'));
});
test('backup/janela ausentes e QA falho bloqueiam; voltar preserva dados e desativa CLI nova',async()=>{
 const f=fixture();await f.op.main('preparar',version);delete f.process.env.CONFIRM_PROD_MAINTENANCE;await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'preparado');
 f.process.env.CONFIRM_PROD_MAINTENANCE='SIM';f.failQa(true);await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'aplicando');f.failQa(false);
 const plan=Buffer.from(f.files.get(PLAN));await f.op.main('voltar');await f.op.main('conferir');assert.equal(f.state().phase,'retornado');
 for(const [p,b]of old)assert.deepEqual(f.files.get(ROOT+'/'+p),b);assert.deepEqual(f.files.get(PLAN),plan);assert(!f.files.has(ROOT+'/'+op.ENTRY));
 assert(f.files.has(STATE+'/cli-complemento-desativada.cjs'));await f.op.main('voltar');assert.equal(f.calls.filter(c=>c.args[1]==='restart').length,1);
});
test('retorno interrompido e retomavel sem reset ou apagar planos',async()=>{
 const f=fixture();await f.op.main('preparar',version);await f.op.main('aplicar');f.breakReturn();await assert.rejects(f.op.main('voltar'),/QUEDA_RETORNO/);assert.equal(f.state().phase,'retornando');
 await f.op.main('voltar');assert.equal(f.state().phase,'retornado');await f.op.main('conferir');assert.deepEqual(f.ps.slice(1).map(p=>p.pid),[102,103]);
});
test('alteracao concorrente no plano, banco ou DEV impede afirmar backend pronto',async()=>{
 const f=fixture();await f.op.main('preparar',version);f.changePlan(true);await assert.rejects(f.op.main('aplicar'));assert.notEqual(f.state().phase,'backend_pronto');
 const b=fixture();await b.op.main('preparar',version);b.changeDb(true);await assert.rejects(b.op.main('aplicar'));assert.equal(b.state().phase,'preparado');
 const p=fixture();await p.op.main('preparar',version);p.ps[1].pid=999;await assert.rejects(p.op.main('aplicar'));assert.equal(p.state().phase,'preparado');
});
test('inventario bloqueia frontend antes do backend, migration, deps e hashes indevidos',()=>{
 assert.notEqual(op.canonical(new Date('2026-10-25T01:00:00Z')),op.canonical(new Date('2026-10-25T02:00:00Z')));
 const names=[...op.ALLOWED],read=p=>target.get(p),oldRead=p=>old.get(p)||null;
 op.inventory(manifest,names,read,oldRead);
 for(const extra of ['frontend/src/App.jsx','backend/src/app.js','backend/migrations/NOVA.js'])assert.throws(()=>op.inventory(manifest,[...names,extra],read,oldRead));
 assert.throws(()=>op.inventory({...manifest,migration:'NOVA'},names,read,oldRead));
 assert.throws(()=>op.inventory(manifest,names,p=>p===op.ALLOWED[0]?Buffer.from('ADULTERADO'):read(p),oldRead));
 const pkg=JSON.parse(target.get('backend/package.json'));pkg.dependencies.saxes='VERSAO_INDEVIDA';const bytes=Buffer.from(JSON.stringify(pkg));
 const bad=structuredClone(manifest);bad.backend.find(f=>f.path==='backend/package.json').sha256=op.hash(bytes);
 assert.throws(()=>op.inventory(bad,names,p=>p==='backend/package.json'?bytes:read(p),oldRead));
});
