'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const op=require('./atualizar-dev-fiscal-vinculos-20261024.cjs');
function snapshot(){return{infrastructure:{daemon:1,dumps:['imutavel'],unit:'imutavel'},apps:[
 {name:'backend-solicitacoes',pid:10,node:'prod',env:'secreto-hash',uptime:1,restarts:1},
 {name:'backend-dev',pid:20,node:'dev',env:'secreto-hash',uptime:1,restarts:1},
 {name:'fluxy-experience-api',pid:30,node:'experience',env:'secreto-hash',uptime:1,restarts:1}]};}
function after(before){const s=structuredClone(before);Object.assign(s.apps[1],{pid:21,uptime:2,restarts:2});return s;}
test('manifesto exclusivamente backend/documentos; alteracao de frontend ou dependencia recusada',()=>{
 op.validateInventory(op.CHANGESET);assert.throws(()=>op.validateInventory([...op.CHANGESET,'M\tfrontend/src/App.jsx']));
 const before={scripts:{antigo:'node antigo.js'},dependencies:{mysql2:'3'}};
 const next=structuredClone(before);Object.assign(next.scripts,op.QA);op.validatePackage(before,next);
 next.dependencies.mysql2='4';assert.throws(()=>op.validatePackage(before,next));
});
test('somente PID/uptime/restart de DEV podem mudar; env/Nodes/dumps/outros PIDs protegidos',()=>{
 const a=snapshot(),b=after(a);op.assertTransition(a,b,true);op.assertTransition(a,a,false);
 for(const mutate of[s=>s.apps[0].pid++,s=>s.apps[2].pid++,s=>s.apps[1].env='alterado',s=>s.apps[1].node='global',s=>s.infrastructure.unit='alterado',s=>s.apps[1].restarts++]){
  const bad=structuredClone(b);mutate(bad);assert.throws(()=>op.assertTransition(a,bad,true));
 }
});
test('ambiente real preservado; apenas metadados de execucao PM2 do DEV normalizados',()=>{
 const initial={DB_HOST:'staging',TOKEN:'ficticio',pm_uptime:'1',restart_time:'0',status:'launching',exit_code:'0'};
 const next={...initial,pm_uptime:'2',restart_time:'1',exit_code:'0'};
 const normalize=op.processEnvironmentForComparison;
 assert.deepEqual(normalize(initial,{},true),normalize(next,{},true));
 assert.notDeepEqual(normalize(initial,{},false),normalize(next,{},false));
 assert.notDeepEqual(normalize(initial,{},true),normalize({...next,TOKEN:'mudou'},{},true));
 assert.notDeepEqual(normalize(initial,{pm_uptime:'1'},true),normalize(next,{pm_uptime:'1'},true));
});
test('migration precisa concluir antes de restart e frontend nunca e executado',async()=>{
 const before=snapshot(),events=[];let current=before;
 const io={assert:op.assertTransition,snapshot:()=>current,save:s=>events.push(s.phase),
  migrate:()=>{events.push('migration');return{applied:true,structure_ok:true};},
  restart:()=>{events.push('restart-only-dev');current=after(before);},ready:()=>current};
 const state=await op.finish({phase:'prepared',before},io);assert.equal(state.phase,'done');
 assert.deepEqual(events,['migration','schema_ready','restarting','restart-only-dev','done']);
});
test('falha na migration nao reinicia; retomada apos restart nao reinicia duas vezes',async()=>{
 const before=snapshot();let restarts=0;
 const io={assert:op.assertTransition,snapshot:()=>before,save:()=>{},migrate:()=>{throw Error('falha');},restart:()=>restarts++,ready:()=>after(before)};
 await assert.rejects(op.finish({phase:'prepared',before},io));assert.equal(restarts,0);
 const result=await op.finish({phase:'restarting',before},io);assert.equal(result.phase,'done');assert.equal(restarts,0);
});
