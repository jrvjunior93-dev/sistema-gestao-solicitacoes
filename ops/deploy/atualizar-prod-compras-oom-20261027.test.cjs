'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const op=require('./atualizar-prod-compras-oom-20261027.cjs');
function manifest(){return{base:op.BASE,runtime_files:2,database_writes:0,migrations:0,heap_mib:4096,
 files:op.FILES.map(p=>({path:p,sha256:op.hash(p),old_sha256:op.hash('old:'+p)})),extra:op.EXTRA.map(p=>({path:p,sha256:op.hash(p)}))};}
function snap(){return{daemon:'42',persisted:[['dump','hash']],apps:[
 {name:'backend-solicitacoes',pid:50,restarts:3,env:'prod-env',envFile:'prod-file',node:'prod',policy:'prod4096'},
 {name:'backend-dev',pid:60,restarts:2,env:'dev-env',envFile:'dev-file',node:'dev',policy:'dev'},
 {name:'fluxy-experience-api',pid:70,restarts:0,env:'exp-env',envFile:'exp-file',node:'experience',policy:'experience'}]};}
test('inventario fechado rejeita extras, exclusoes, adulteracao e escrita de banco',()=>{
 const names=[...op.FILES,...op.EXTRA,op.MANIFEST];op.inventory(manifest(),names,p=>p,p=>'old:'+p);
 for(const p of ['backend/.env','frontend/src/App.jsx','backend/migrations/novo.js','backend/src/routes.js','backend/package.json','backend/src/controllers/HomeBlocosController.js'])assert.throws(()=>op.inventory(manifest(),[...names,p],p=>p,p=>'old:'+p));
 assert.throws(()=>op.inventory(manifest(),names.slice(1),p=>p,p=>'old:'+p));assert.throws(()=>op.inventory(manifest(),names,p=>p+'bad',p=>'old:'+p));assert.throws(()=>op.inventory(manifest(),names,p=>p,()=>null));
 for(const delta of [{migrations:1},{database_writes:1},{heap_mib:2304},{runtime_files:3},{base:'other'}])assert.throws(()=>op.inventory({...manifest(),...delta},names,p=>p,p=>'old:'+p));
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
 const env=Object.fromEntries(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_COMPRAS_OOM_PROD'].map(k=>[k,'SIM']));op.confirmations(env);for(const k of Object.keys(env))assert.throws(()=>op.confirmations({...env,[k]:'NAO'}));
 op.automaticOff({NSDOCS_V2_ENABLED:'false'},{NSDOCS_V2_FIXTURES_ENABLED:false});for(const v of ['true','1',true])assert.throws(()=>op.automaticOff({NSDOCS_V2_ENABLED:v}));
 assert.throws(()=>op.automaticOff({ALLOW_SCHEMA_MIGRATIONS:'true'}));assert.throws(()=>op.automaticOff({NODE_TLS_REJECT_UNAUTHORIZED:'0'}));
});
test('QA deve passar antes de baseline e restart; nao ha migration no fluxo',async()=>{
 const events=[],baseline=snap(),s={phase:'arquivos_prontos'},io={qa:()=>events.push('qa'),baseline:()=>{events.push('baseline');return baseline;},save:(s,p)=>{s.phase=p;events.push(p);},restart:()=>events.push('restart'),ready:()=>events.push('ready')};
 await op.finish(s,io);assert.deepEqual(events,['qa','baseline','reiniciando','restart','ready','aplicado']);assert.deepEqual(s.restart_before,baseline);
 events.length=0;await op.finish({phase:'reiniciando'},io);assert.deepEqual(events,['restart','ready','aplicado']);
 events.length=0;await assert.rejects(op.finish({phase:'arquivos_prontos'},{...io,qa:()=>{throw Error('QA_FAIL');}}),/QA_FAIL/);assert.deepEqual(events,[]);
 events.length=0;await assert.rejects(op.finish({phase:'arquivos_prontos'},{...io,baseline:()=>{throw Error('ENV_CHANGED');}}),/ENV_CHANGED/);assert.deepEqual(events,['qa']);
});
test('aplicador nao carrega aplicacao/banco, nao chama captura e nao persiste PM2',()=>{
 const text=fs.readFileSync(__dirname+'/atualizar-prod-compras-oom-20261027.cjs','utf8');
 assert(!/require\([^\n]*(?:models|mysql2|sequelize|server\.js|src\/app)/.test(text));assert(!/\b(?:npm|npx)\b|--update-env|--node-args|reset --hard|git clean/.test(text));
 assert(!/CLI,\s*['"](?:save|resurrect|update|delete|kill|reload)['"]/.test(text));assert.match(text,/CLI,'restart',String\(initial\.id\)/);
 assert(!/run\([^\n]*(?:nsdocsProd|Schema\.js|migration)/.test(text));assert.equal((text.match(/http\.get\(/g)||[]).length,1);assert.match(text,/path:'\/health'/);
 assert.match(text,/O_EXCL\|fs.constants.O_NOFOLLOW/);assert.match(text,/git\(\['merge','--ff-only',s.version\]\)/);assert(!/git\(\['pull'/.test(text));
});
test('manifesto real coincide com os bytes Git normalizados e base imutavel',()=>{
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST),'utf8'));
 const read=p=>Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
 const oldRead=p=>{try{return cp.execFileSync('git',['show',op.BASE+':'+p],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{return null;}};
 op.inventory(m,[...op.FILES,...op.EXTRA,op.MANIFEST],read,oldRead);
});
