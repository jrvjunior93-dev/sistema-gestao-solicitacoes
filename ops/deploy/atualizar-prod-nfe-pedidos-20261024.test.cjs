'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const op=require('./atualizar-prod-nfe-pedidos-20261024.cjs');
const root=path.resolve(__dirname,'../..'),ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main',BACKEND=ROOT+'/backend',STATE=ROOT+'/.git/fluxy-nfe-prod-20261024';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',DAEMON='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const version='a'.repeat(40),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'nfe-pedidos-producao-20261024.manifest.json')));
const baseRead=p=>cp.execFileSync('git',['show',op.BASE+':'+p],{cwd:root,stdio:['ignore','pipe','ignore']});
const target=new Map(manifest.backend.map(f=>[f.path,fs.readFileSync(path.join(root,f.path))]));
target.set('ops/deploy/nfe-pedidos-producao-20261024.manifest.json',Buffer.from(JSON.stringify(manifest)));
const base=new Map();for(const f of manifest.backend)try{base.set(f.path,baseRead(f.path));}catch{}
function fixture(){
  const files=new Map(),dirs=new Set(),modes=new Map(),calls=[],logs=[];let head=op.BASE,dirty=false,applied=false,qaFail=false,ddlFail=false,healthy=true,peerChanged=false;
  const ps=[['backend-solicitacoes',BACKEND,NODE,100],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend','/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node',101],
    ['fluxy-experience-api','/home/ubuntu/fluxy-experience/api','/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node',102]].map(([name,cwd,node,pid],i)=>({name,pid,pm_id:i,pm2_env:{name,status:'online',pm_cwd:cwd,pm_exec_path:cwd+(i===2?'/src/server.js':'/server.js'),exec_mode:'fork_mode',exec_interpreter:node,watch:false,env:{DEPLOYMENT_ENV:i?'development':'production',PORT:i?'8001':'8000'}}}));
  const put=(f,b,mode=0o600)=>{files.set(f,Buffer.from(b));modes.set(f,mode);};
  put('/home/ubuntu/.pm2/pm2.pid','90');
  put(BACKEND+'/node_modules/@aws-sdk/nested-clients/package.json',JSON.stringify({version:'3.996.12'}));
  for(const f of ['/usr/bin/node',DAEMON,...ps.map(p=>p.pm2_env.exec_interpreter),'/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak','/etc/systemd/system/pm2-ubuntu.service'])put(f,'QA_'+f);
  for(const p of ps)put(p.pm2_env.pm_cwd+'/.env','QA_SECRET_PRIVADO');
  for(const [p,b]of base)put(ROOT+'/'+p,b,0o644);
  const rawEnv=p=>Buffer.from('HOME=/home/ubuntu\0DEPLOYMENT_ENV='+p.pm2_env.env.DEPLOYMENT_ENV+'\0PORT='+p.pm2_env.env.PORT+'\0DB_PASSWORD=QA_SECRET_PRIVADO\0pm_uptime='+p.pid+'\0');
  const fakeFs={
    readFileSync(f,encoding){let b;if(/^\/proc\/\d+\/environ$/.test(f)){const p=ps.find(p=>f===`/proc/${p.pid}/environ`);assert(p);b=rawEnv(p);}else b=files.get(f);if(!b)throw Error('QA_FILE_NOT_FOUND');return encoding?b.toString():Buffer.from(b);},
    readlinkSync(f){if(f==='/proc/90/exe')return DAEMON;const p=ps.find(p=>f.startsWith(`/proc/${p.pid}/`));assert(p);return f.endsWith('/exe')?p.pm2_env.exec_interpreter:p.pm2_env.pm_cwd;},
    realpathSync:f=>f,statSync(f){assert(files.has(f));return{mode:modes.get(f)};},
    lstatSync(f){assert(files.has(f));return{isFile:()=>true,isSymbolicLink:()=>false,mode:0o100000|(modes.get(f)||0o600),uid:1000};},
    existsSync:f=>dirs.has(f)||files.has(f),mkdirSync(f){assert(!dirs.has(f));dirs.add(f);},rmdirSync(f){assert(dirs.delete(f));},
    writeFileSync(f,b,opts){assert(opts.flag==='wx');assert(!files.has(f));put(f,b,opts.mode);},
    renameSync(from,to){assert(files.has(from));put(to,files.get(from),modes.get(from));files.delete(from);modes.delete(from);if(to.startsWith(BACKEND+'/')&&!to.includes('.tmp-'))dirty=true;}
  };
  const output=(value,opts)=>({status:0,stdout:opts.encoding===null?Buffer.from(value):String(value)});
  const fakeCp={spawnSync(bin,args,opts){calls.push({bin,args,env:opts.env});
    if(bin==='/usr/bin/git'){
      const a=args[0]==='--no-pager'?args.slice(4):args;
      if(a[0]==='branch')return output('main',opts);
      if(a[0]==='status')return output(dirty?' M backend/package.json':'',opts);
      if(a[0]==='fetch'||a[0]==='merge-base')return output('',opts);
      if(a[0]==='rev-parse')return output(a[1]==='origin/main'?version:head,opts);
      if(a[0]==='show'){const i=a[1].indexOf(':'),sha=a[1].slice(0,i),p=a[1].slice(i+1);return output((sha===version?target:base).get(p),opts);}
      if(a[0]==='ls-tree')return output(base.has(a[3])?'100644 blob QA\t'+a[3]:'',opts);
      if(a[0]==='diff')return output(a.includes('--diff-filter=D')?'':a.includes('--name-only')&&a.length===2?(dirty?'backend/package.json':''):[...manifest.backend.map(f=>f.path),'ops/deploy/qa-metadata.cjs'].join('\n'),opts);
      if(a[0]==='merge'){head=version;for(const [p,b]of target)put(ROOT+'/'+p,b,0o644);dirty=false;return output('',opts);}
      throw Error('QA_GIT_FORA_DO_ESCOPO');
    }
    if(bin===DAEMON){
      if(args[1]==='jlist')return output(JSON.stringify(ps),opts);
      assert.deepEqual(JSON.parse(JSON.stringify(args)),['/usr/lib/node_modules/pm2/bin/pm2','restart','0']);
      assert(!Object.keys(opts.env).some(k=>k.startsWith('CONFIRM_')));
      ps[0].pid+=1000;if(peerChanged)ps[1].pid+=2000;return output('ok',opts);
    }
    if(bin==='/usr/bin/systemctl'){assert.deepEqual(JSON.parse(JSON.stringify(args)),['is-active','--quiet','fluxy-prod-db-backup.timer']);return output('',opts);}
    assert.equal(bin,NODE);
    if(args[0]==='-e'){
      if(args[1].includes('NFE_LEDGER:'))return output('NFE_LEDGER:'+JSON.stringify({applied}),opts);
      if(args[1].includes('--aplicar')){if(ddlFail)return{status:1,stdout:'',stderr:'QA_SECRET_PRIVADO'};applied=true;}
      return output('NFE_SCHEMA:'+JSON.stringify({applied,structure_ok:applied}),opts);
    }
    if(qaFail)return{status:1,stdout:'',stderr:'QA_SECRET_PRIVADO'};
    return output('QA ok',opts);
  }};
  const fakeHttp={get(_opts,cb){const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=healthy?200:500;cb(res);res.emit('data',JSON.stringify({ok:healthy}));res.emit('end');});return req;}};
  const processFake={platform:'linux',arch:'x64',version:'v24.22.1',execPath:NODE,getuid:()=>1000,cwd:()=>ROOT,argv:['node','qa'],env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_FISCAL_VINCULOS_PROD_SCHEMA:'SIM'}};
  const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'atualizar-prod-nfe-pedidos-20261024.cjs'),'utf8'),{module:mod,Buffer,structuredClone,process:processFake,console:{log:s=>logs.push(String(s))},setTimeout:fn=>setTimeout(fn,0),require:n=>n==='node:fs'?fakeFs:n==='node:child_process'?fakeCp:n==='node:http'?fakeHttp:require(n)});
  return{operator:mod.exports,files,ps,calls,logs,process:processFake,modes,state:()=>JSON.parse(files.get(STATE+'/estado.json')),
    failQa:v=>qaFail=v,failDdl:v=>ddlFail=v,health:v=>healthy=v,peer:v=>peerChanged=v,get applied(){return applied;}};
}
test('preparar nao faz checkout/migration/restart; aplicar usa SHA, QA/schema antes de um unico restart e conserva env/dumps/peers',async()=>{
  const f=fixture(),protectedFiles=new Map([...f.files].filter(([p])=>p.endsWith('.env')||p.includes('/.pm2/')||p.includes('/bin/node')));
  await f.operator.main('preparar',version);assert.equal(f.state().phase,'preparado');assert(!f.calls.some(c=>c.args[0]==='merge'||c.args[1]==='restart'));
  await f.operator.main('aplicar');assert.equal(f.state().phase,'backend_pronto');assert(f.applied);assert.equal(f.calls.filter(c=>c.args[1]==='restart').length,1);
  assert(f.calls.findIndex(c=>c.args[0]==='-e'&&c.args[1].includes('--aplicar'))<f.calls.findIndex(c=>c.args[1]==='restart'));
  for(const [p,b]of protectedFiles)assert.deepEqual(f.files.get(p),b,p);
  assert.equal(f.ps[1].pid,101);assert.equal(f.ps[2].pid,102);assert.equal(f.modes.get(STATE+'/estado.json'),0o600);
  await f.operator.main('conferir');await assert.rejects(f.operator.main('aplicar'));assert.equal(f.calls.filter(c=>c.args[1]==='restart').length,1);
  assert(!f.logs.join('\n').includes('QA_SECRET_PRIVADO'));
});
test('backup ausente e QA/DDL falho interrompem antes de restart e deixam retorno diagnosticavel',async()=>{
  for(const mode of['backup','qa','ddl']){const f=fixture();await f.operator.main('preparar',version);
    if(mode==='backup')delete f.process.env.CONFIRM_PROD_BACKUP;if(mode==='qa')f.failQa(true);if(mode==='ddl')f.failDdl(true);
    await assert.rejects(f.operator.main('aplicar'));assert(!f.calls.some(c=>c.args[1]==='restart'));assert.equal(f.ps[0].pid,100);
  }
});
test('retorno preserva schema aplicado e restaura somente fontes anteriores; nao move HEAD nem altera storage',async()=>{
  const f=fixture();await f.operator.main('preparar',version);await f.operator.main('aplicar');await f.operator.main('voltar');
  assert.equal(f.state().phase,'codigo_anterior');assert(f.applied);assert.equal(f.calls.filter(c=>c.args[1]==='restart').length,2);
  for(const [p,b]of base)assert.deepEqual(f.files.get(ROOT+'/'+p),b,p);
  assert(!f.calls.some(c=>c.args.includes('reset')||c.args.includes('clean')||c.args.includes('--update-env')));
  assert(!f.calls.some(c=>c.args[0]==='merge'&&c.args[2]!==version));
});
test('retorno apos falha antes do ledger guarda migration pendente fora do runtime, sem apagar DDL/historico',async()=>{
  const f=fixture();await f.operator.main('preparar',version);f.failDdl(true);await assert.rejects(f.operator.main('aplicar'));f.failDdl(false);
  await f.operator.main('voltar');assert.equal(f.state().phase,'codigo_anterior');assert(!f.applied);
  assert(f.files.has(STATE+'/migration-nao-registrada.js'));assert(!f.files.has(BACKEND+'/migrations/'+manifest.migration));
});
test('mudanca de peer impede concluir release; inventario alterado ou frontend no pacote e negado',async()=>{
  const f=fixture();await f.operator.main('preparar',version);f.peer(true);await assert.rejects(f.operator.main('aplicar'));assert.notEqual(f.state().phase,'backend_pronto');
  const names=manifest.backend.map(f=>f.path),pkg=JSON.parse(baseRead('backend/package.json')),lock=JSON.parse(baseRead('backend/package-lock.json'));
  op.validateInventory(manifest,names,p=>target.get(p),pkg,lock);
  assert.throws(()=>op.validateInventory(manifest,[...names,'frontend/src/App.jsx'],p=>target.get(p),pkg,lock));
  assert.throws(()=>op.validateInventory(manifest,names,p=>p==='backend/src/routes.js'?Buffer.from('alterado'):target.get(p),pkg,lock));
});
