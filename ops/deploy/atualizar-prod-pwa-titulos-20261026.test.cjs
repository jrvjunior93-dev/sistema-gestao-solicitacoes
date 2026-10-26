'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const op=require('./atualizar-prod-pwa-titulos-20261026.cjs'),root=path.resolve(__dirname,'../..');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend',PRIVATE='/home/ubuntu/.config/fluxy-nsdocs-prod';
const STATE=ROOT+'/.git/fluxy-pwa-titulos-prod-20261026',PLAN=PRIVATE+'/historical-8e0a4179-506a-4670-88a2-d9079728e263.json';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const version='a'.repeat(40),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'pwa-titulos-prod-20261026.manifest.json')));
const old=new Map(manifest.files.map(f=>[f.path,cp.execFileSync('git',['show',op.BASE+':'+f.path],{cwd:root})]));
const target=new Map([...manifest.files,...manifest.qa].map(f=>[f.path,fs.readFileSync(path.join(root,f.path))]));
target.set('ops/deploy/pwa-titulos-prod-20261026.manifest.json',Buffer.from(JSON.stringify(manifest)));
function fixture(){
 const files=new Map(),meta=new Map(),dirs=new Set([PRIVATE]),fds=new Map(),calls=[],logs=[];let ino=1,fd=1,head=op.OLD,dirty=false,failQa=false,changePlan=false,failRestore=false;
 const put=(p,b,mode=0o600)=>{files.set(p,Buffer.from(b));meta.set(p,{uid:1000,mode,nlink:1,ino:ino++,dev:1});};
 const ps=[['backend-solicitacoes',BACKEND,NODE,101],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',102],['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',103]]
 .map(([name,cwd,node,pid],i)=>({name,pid,pm_id:i,pm2_env:{name,status:'online',pm_cwd:cwd,pm_exec_path:cwd+(i===2?'/src/server.js':'/server.js'),exec_mode:'fork_mode',exec_interpreter:node,watch:false,env:{PORT:String(8000+i)}}}));
 put('/home/ubuntu/.pm2/pm2.pid','90');put(PLAN,'PLANO_INTACTO');put(PRIVATE+'/history.jsonl','HISTORICO_INTACTO');put(PRIVATE+'/credentials.json','CREDENCIAL_INTACTA');put(PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json',JSON.stringify({
 summary:{plan_id:'c456781c-4393-468b-858f-dbf220d8f215',source_plan_id:'8e0a4179-506a-4670-88a2-d9079728e263',company_id:1,source_documents:46,documents_discovered:3529,enumeration_complete:true,source_documents_missing:0,completed_batches:361,pending_batches:345},private_test_value:'NAO_EXIBIR_DADOS_FISCAIS'}));
 for(const p of ['/usr/bin/node',DAEMON,...ps.map(p=>p.pm2_env.exec_interpreter),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service','/etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf'])put(p,'FICTICIO_'+p);
 for(const p of ps)put(p.pm2_env.pm_cwd+'/.env','SEGREDO_FICTICIO_NAO_EXIBIR');for(const [p,b]of old)put(ROOT+'/'+p,b,0o644);
 const stat=p=>{if(dirs.has(p))return {uid:1000,mode:0o700,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
  assert(files.has(p),'arquivo '+p);return {...meta.get(p),size:files.get(p).length,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false};};
 const io={constants:fs.constants,realpathSync:p=>p,existsSync:p=>files.has(p)||dirs.has(p),lstatSync:stat,statSync:stat,
  readFileSync(p,encoding){let b;if(/^\/proc\/\d+\/environ$/.test(p)){const app=ps.find(x=>p===`/proc/${x.pid}/environ`);assert(app);b=Buffer.from('PORT='+app.pm2_env.env.PORT+'\0DB_PASSWORD=SEGREDO_FICTICIO_NAO_EXIBIR\0');}
   else b=files.get(p);assert(b,p);return encoding?b.toString():Buffer.from(b);},
  readdirSync:p=>{assert.equal(p,'/proc');return [...new Set(['90',...ps.map(x=>String(x.pid)),...Array.from(files.keys()).map(x=>x.match(/^\/proc\/(\d+)\/cmdline$/)?.[1]).filter(Boolean)])];},
  readlinkSync(p){if(p==='/proc/90/exe')return DAEMON;const a=ps.find(x=>p.startsWith(`/proc/${x.pid}/`));assert(a);return p.endsWith('/exe')?a.pm2_env.exec_interpreter:a.pm2_env.pm_cwd;},
  mkdirSync:p=>{assert(!dirs.has(p));dirs.add(p);},rmdirSync:p=>{assert(dirs.delete(p));},
  openSync(p,flags,mode){if(files.has(p)&&flags&fs.constants.O_EXCL){const e=Error('ocupado');e.code='EEXIST';throw e;}if(!files.has(p))put(p,'',mode);fds.set(++fd,p);return fd;},
  fstatSync:f=>stat(fds.get(f)),closeSync:f=>{assert(fds.delete(f));},
  unlinkSync:p=>{assert(files.delete(p));meta.delete(p);},
  writeFileSync(p,b,options){if(typeof p==='number'){files.set(fds.get(p),Buffer.from(b));return;}assert(options.flag==='wx');assert(!files.has(p));put(p,b,options.mode);},
  renameSync(a,b){assert(files.has(a));if(failRestore&&b===ROOT+'/'+op.FILES[0])throw Error('RETORNO_INTERROMPIDO_FICTICIO');files.set(b,files.get(a));meta.set(b,meta.get(a));files.delete(a);meta.delete(a);if(b.startsWith(BACKEND+'/'))dirty=true;}
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
    return output(a.length===2?(dirty?changed.join('\n'):''):[...manifest.files.map(f=>f.path),...manifest.qa.map(f=>f.path),'ops/deploy/metadata.cjs'].join('\n'),o);}
   if(a[0]==='merge'){head=version;for(const [p,b]of target)put(ROOT+'/'+p,b,0o644);dirty=false;return output('',o);}throw Error('GIT_NAO_PREVISTO');
  }
  if(bin===DAEMON){
   if(args[1]==='restart'){assert.equal(args[2],'0');assert(!args.includes('--update-env'));ps[0].pid+=100;return output('',o);}
   assert.deepEqual(JSON.parse(JSON.stringify(args)),['/usr/lib/node_modules/pm2/bin/pm2','jlist']);return output(JSON.stringify(ps),o);
  }
  if(bin==='/usr/bin/systemctl'){assert.deepEqual(JSON.parse(JSON.stringify(args)),['is-active','--quiet','fluxy-prod-db-backup.timer']);return output('',o);}
  assert.equal(bin,NODE);assert.equal(args[0],'--test');assert.equal(o.env.DEPLOYMENT_ENV,undefined);
  assert(!Object.keys(o.env).some(k=>k.startsWith('CONFIRM_')||k.startsWith('AWS_')||k.startsWith('DB_')));
  if(changePlan)put(typeof changePlan==='string'?changePlan:PLAN,'ALTERACAO_CONCORRENTE');return failQa?{status:1,stdout:'',stderr:'SEGREDO_FICTICIO_NAO_EXIBIR'}:output('QA OK',o);
 }};
 const http={get(_o,callback){const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data','{"ok":true}');res.emit('end');});return req;}};
 const processMock={platform:'linux',arch:'x64',pid:900,version:'v24.22.1',execPath:NODE,getuid:()=>1000,cwd:()=>ROOT,argv:['node','fixture'],env:{CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PWA_TITULOS_PROD:'SIM'}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'atualizar-prod-pwa-titulos-20261026.cjs'),'utf8'),{module:mod,Buffer,process:processMock,setTimeout:fn=>{queueMicrotask(fn);return 1;},console:{log:s=>logs.push(String(s))},require:n=>n===BACKEND+'/node_modules/dotenv'?require('../../backend/node_modules/dotenv'):n===BACKEND+'/src/modules/fiscal/services/nsdocsHistorical/manual/complement/plan'?{validate:p=>p,summary:p=>p.summary}:n===BACKEND+'/src/modules/fiscal/services/nsdocsHistorical/manual/complement/store'?{load:()=>JSON.parse(io.readFileSync(PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json','utf8'))}:n==='node:fs'?io:n==='node:child_process'?child:n==='node:http'?http:require(n)});
 return {op:mod.exports,files,meta,ps,calls,logs,process:processMock,put,state:()=>JSON.parse(files.get(STATE+'/estado.json')),failQa:v=>failQa=v,changePlan:v=>changePlan=v,failRestore:v=>failRestore=v};
}
test('preparar/aplicar/conferir preservam processos/env/dumps/plano/journal com restart somente producao e permitem replay',async()=>{
 const f=fixture(),before=new Map(f.files);await f.op.main('preparar',version);assert.equal(f.state().phase,'preparado');await f.op.main('conferir');
 await f.op.main('aplicar');assert.equal(f.state().phase,'aplicado');await f.op.main('aplicar');await f.op.main('conferir');
 for(const [p,b]of before)if(!p.startsWith(BACKEND+'/src/'))assert.deepEqual(f.files.get(p),b,p);
 assert.deepEqual(f.ps.map(x=>x.pid),[201,102,103]);assert.equal(f.meta.get(STATE+'/estado.json').mode,0o600);
 assert.equal(f.calls.filter(c=>c.args.includes('restart')).length,1);assert(!f.calls.some(c=>c.args.includes('reset')||c.args.includes('--update-env')));
 assert(!f.logs.join('\n').includes('SEGREDO_FICTICIO'));
});
test('captura ativa impede preparacao; nao remove lock pertencente a outro processo',async()=>{
 const f=fixture(),lock=PRIVATE+'/query.lock';f.put(lock,'OUTRO_PID');await assert.rejects(f.op.main('preparar',version));assert.equal(f.files.get(lock).toString(),'OUTRO_PID');
 assert(!f.files.has(PRIVATE+'/historical-plan.lock'));assert(!f.calls.some(c=>c.args[0]==='merge'));
});
test('flag ausente e QA falho bloqueiam; retorno restaura apenas1fonte e guarda progresso',async()=>{
 const f=fixture();await f.op.main('preparar',version);delete f.process.env.CONFIRM_PWA_TITULOS_PROD;
 await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'preparado');f.process.env.CONFIRM_PWA_TITULOS_PROD='SIM';
 f.failQa(true);await assert.rejects(f.op.main('aplicar'));assert.equal(f.state().phase,'aplicando');f.failQa(false);
 const plan=Buffer.from(f.files.get(PLAN));await f.op.main('voltar');await f.op.main('conferir');assert.equal(f.state().phase,'retornado');
 for(const [p,b]of old)assert.deepEqual(f.files.get(ROOT+'/'+p),b);assert.deepEqual(f.files.get(PLAN),plan);
});
test('alteracao concorrente do plano ou processo impede confirmar aplicado',async()=>{
 const f=fixture();await f.op.main('preparar',version);f.changePlan(true);await assert.rejects(f.op.main('aplicar'));assert.notEqual(f.state().phase,'aplicado');
 const p=fixture();await p.op.main('preparar',version);p.ps[1].pid=999;await assert.rejects(p.op.main('aplicar'));
});
test('inventario recusa frontend, fonte extra e hash adulterado',()=>{
 const names=[...manifest.files.map(f=>f.path),...manifest.qa.map(f=>f.path)],read=p=>target.get(p);
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

test('retorno interrompido na fonte retoma e replay nao muda dados ou processos',async()=>{
 const f=fixture();await f.op.main('preparar',version);await f.op.main('aplicar');f.failRestore(true);
 await assert.rejects(f.op.main('voltar'),/RETORNO_INTERROMPIDO/);assert.equal(f.state().phase,'retornando');
 assert.deepEqual(f.files.get(ROOT+'/'+op.FILES[0]),target.get(op.FILES[0]));
 f.failRestore(false);await f.op.main('voltar');await f.op.main('conferir');await f.op.main('voltar');
 assert.equal(f.state().phase,'retornado');for(const [p,b]of old)assert.deepEqual(f.files.get(ROOT+'/'+p),b);
 assert.deepEqual(f.ps.map(x=>x.pid),[301,102,103]);
 assert.equal(JSON.parse(f.files.get(PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json')).summary.documents_discovered,3529);
});

test('recusa automatico/fixtures ativos, plano de outra origem e perda de cobertura',async()=>{
 for(const key of ['NSDOCS_V2_ENABLED','NSDOCS_V2_FIXTURES_ENABLED']){
  const f=fixture();f.put(BACKEND+'/.env',key+'=true');await assert.rejects(f.op.main('preparar',version),/AUTOMATICO_LIGADO/);
  const nested=fixture();nested.ps[0].pm2_env.env[key]='true';await assert.rejects(nested.op.main('preparar',version),/AUTOMATICO_LIGADO/);
 }
 for(const changes of [{documents_discovered:3528},{source_documents:45},{source_plan_id:'outra'}]){
  const f=fixture(),file=PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json',plan=JSON.parse(f.files.get(file));
  Object.assign(plan.summary,changes);f.put(file,JSON.stringify(plan));await assert.rejects(f.op.main('preparar',version),/PROGRESSO_DIVERGENTE/);
 }
});
test('backup do plano fica privado; retorno permite progresso posterior e jamais restaura dados',async()=>{
 const f=fixture(),file=PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json';
 await f.op.main('preparar',version);assert.equal(f.meta.get(STATE+'/complemento-antes.json').mode,0o600);
 assert.equal(op.hash(f.files.get(STATE+'/complemento-antes.json')),f.state().plan_backup_sha256);
 await f.op.main('aplicar');const plan=JSON.parse(f.files.get(file));plan.summary.xml_downloads=1800;f.put(file,JSON.stringify(plan));
 await f.op.main('conferir');await f.op.main('voltar');assert.equal(JSON.parse(f.files.get(file)).summary.xml_downloads,1800);
 assert.equal(JSON.parse(f.files.get(STATE+'/complemento-antes.json')).summary.documents_discovered,3529);
 assert(!f.logs.join(' ').includes('NAO_EXIBIR_DADOS_FISCAIS'));
});

test('manifesto congelado tambem entra na guarda de integridade',async()=>{
 const f=fixture(),file=PRIVATE+'/complement-c456781c-4393-468b-858f-dbf220d8f215.json';
 const payload=JSON.parse(f.files.get(file));Object.assign(payload,{format:'manifest-progress-v1',id:'c456781c-4393-468b-858f-dbf220d8f215',manifest_id:'12345678-1234-4234-8234-123456789abc'});
 f.put(file,JSON.stringify(payload));const snapshot=PRIVATE+'/complement-'+payload.id+'-'+payload.manifest_id+'.manifest.json';f.put(snapshot,'MANIFESTO_PRIVADO');
 await f.op.main('preparar',version);f.changePlan(snapshot);await assert.rejects(f.op.main('aplicar'),/PROGRESSO_MUDOU/);
});
test('TLS desativado impede ate a preparacao',async()=>{
 const f=fixture();f.process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';await assert.rejects(f.op.main('preparar',version),/CONTEXTO_INVALIDO/);assert.equal(f.calls.length,0);
});

test('recusa captura ativa ou janela de manutencao ausente',async()=>{
 const f=fixture();f.put('/proc/987/cmdline','node\0scripts/nsdocsProdComplement.js\0--capturar\0');
 await assert.rejects(f.op.main('preparar',version),/CAPTURA_ATIVA/);assert(!f.calls.some(c=>c.args.includes('restart')));
 const p=fixture();await p.op.main('preparar',version);delete p.process.env.CONFIRM_PROD_MAINTENANCE;
 await assert.rejects(p.op.main('aplicar'),/CONFIRMACAO_AUSENTE/);assert(!p.calls.some(c=>c.args.includes('restart')));
});
