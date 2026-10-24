'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const op=require('./atualizar-dev-nfe-pagamentos-pedidos-20261024.cjs');
function snapshot(){return{infrastructure:{daemon:1,dumps:['privado600'],unit:'isolado'},apps:[
 {name:'backend-solicitacoes',pid:10,node:'prod',env:'hash',uptime:1,restarts:1},
 {name:'backend-dev',pid:20,node:'dev',env:'hash',uptime:1,restarts:1},
 {name:'fluxy-experience-api',pid:30,node:'experience',env:'hash',uptime:1,restarts:1}]};}
function after(before){const s=structuredClone(before);Object.assign(s.apps[1],{pid:21,uptime:2,restarts:2});return s;}
test('aceita ultimo backend DEV somente quando etapa intermediaria nao altera backend/dependencias',()=>{
 op.validateStartingHead(op.BASE,'target');op.validateStartingHead('target','target');op.validateStartingHead(op.PREVIOUS_BACKEND,'target','');
 assert.throws(()=>op.validateStartingHead('outra-versao','target'));
 assert.throws(()=>op.validateStartingHead(op.PREVIOUS_BACKEND,'target','M backend/src/qualquer.js'));
});
test('manifesto rejeita frontend, migration, lockfile ou artefato fora do pacote',()=>{
 op.validateInventory(op.CHANGESET);
 for(const file of['frontend/src/App.jsx','backend/migrations/nova.js','backend/package-lock.json','AGENTS.md'])assert.throws(()=>op.validateInventory([...op.CHANGESET,'M\t'+file]));
 const before={scripts:{old:'node old.js'},dependencies:{mysql2:'3'}};
 const next=structuredClone(before);Object.assign(next.scripts,op.QA);op.validatePackage(before,next);
 next.dependencies.mysql2='4';assert.throws(()=>op.validatePackage(before,next));
});
test('so DEV muda PID/uptime/restart uma vez; demais processos/ambientes/Nodes/systemd/dumps imutaveis',()=>{
 const a=snapshot(),b=after(a);op.assertTransition(a,b,true);op.assertTransition(a,a,false);
 for(const mutate of[s=>s.apps[0].pid++,s=>s.apps[2].pid++,s=>s.apps[1].env='mudou',s=>s.apps[1].node='global',s=>s.infrastructure.unit='mudou',s=>s.apps[1].restarts++]){
   const bad=structuredClone(b);mutate(bad);assert.throws(()=>op.assertTransition(a,bad,true));
 }
});
test('apenas telemetria PM2 conhecida do DEV e normalizada; configuracao real nao e ignorada',()=>{
 const a={TOKEN:'qa',pm_uptime:'1',restart_time:'0',status:'launching'},b={...a,pm_uptime:'2',restart_time:'1'};
 assert.deepEqual(op.processEnvironmentForComparison(a,{},true),op.processEnvironmentForComparison(b,{},true));
 assert.notDeepEqual(op.processEnvironmentForComparison(a,{},false),op.processEnvironmentForComparison(b,{},false));
 assert.notDeepEqual(op.processEnvironmentForComparison(a,{},true),op.processEnvironmentForComparison({...b,TOKEN:'mudou'},{},true));
});
test('schema somente leitura antes de restart e retomada nao reinicia novamente',async()=>{
 const before=snapshot(),events=[];let current=before;
 const io={assert:op.assertTransition,snapshot:()=>current,save:s=>events.push(s.phase),verify:()=>events.push('conferir-schema'),
   restart:()=>{events.push('restart-only-dev');current=after(before);},ready:()=>current};
 const state=await op.finish({phase:'prepared',before},io);assert.equal(state.phase,'done');
 assert.deepEqual(events,['conferir-schema','verified','restarting','restart-only-dev','done']);
 events.length=0;await op.finish({phase:'restarting',before},io);assert.deepEqual(events,['done']);
});
test('falha de schema ou mudanca protegida impede reinicio',async()=>{
 const before=snapshot();let restarts=0;
 const io={assert:op.assertTransition,snapshot:()=>before,save:()=>{},verify:()=>{throw Error('schema ausente');},restart:()=>restarts++,ready:()=>after(before)};
 await assert.rejects(op.finish({phase:'prepared',before},io));assert.equal(restarts,0);
 const bad=snapshot();bad.apps[0].pid++;io.snapshot=()=>bad;await assert.rejects(op.finish({phase:'verified',before},io));assert.equal(restarts,0);
});
test('operador nao aplica migration, npm, frontend, atualizacao ambiente ou comando global PM2',()=>{
 const source=fs.readFileSync(__filename.replace('.test.cjs','.cjs'),'utf8');
 assert(source.includes("'scripts/fiscalVinculosDevSchema.js','--conferir'"));
 assert(!source.includes("'--aplicar'"));assert(!/\[PM2_CLI,\s*'(?:save|update|resurrect|startup|kill)'/.test(source));
 assert(source.includes("[PM2_CLI,'restart','backend-dev']"));assert(!source.includes("[PM2_CLI,'restart','backend-solicitacoes']"));
 assert(source.includes("s.bucket!=='fluxy-fiscal-dev'"));
});
