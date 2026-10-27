'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const op=require('./atualizar-dev-autorizacao-valor-20261026.cjs');
function snapshot(){return{infrastructure:{daemon:1,dumps:['hash'],unit:'isolado'},apps:[
 {name:'backend-solicitacoes',pid:10,node:'prod',env:'hash',uptime:1,restarts:1},
 {name:'backend-dev',pid:20,node:'dev',env:'hash',uptime:1,restarts:1},
 {name:'fluxy-experience-api',pid:30,node:'experience',env:'hash',uptime:1,restarts:1}]};}
function after(a){const b=structuredClone(a);Object.assign(b.apps[1],{pid:21,uptime:2,restarts:2});return b;}
test('base e backlog DEV conhecidos; rejeitar outra revisao ou diff',()=>{
 op.validateStartingHead(op.BASE,'target');op.validateStartingHead('target','target');
 const diff=cp.execFileSync('git',['rev-parse',op.PREVIOUS_BACKEND+':backend',op.BASE+':backend'],{encoding:'utf8'}).trim();
 op.validateStartingHead(op.PREVIOUS_BACKEND,'target',diff);
 assert.throws(()=>op.validateStartingHead('outra','target'));assert.throws(()=>op.validateStartingHead(op.PREVIOUS_BACKEND,'target','diferente'));
});
test('inventario estrito com hashes; frontend/env/dependencias extras rejeitados',()=>{
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST))),read=p=>fs.readFileSync(path.join(root,p));
 op.validateInventory(m,[...op.PATHS,op.MANIFEST],read);
 for(const p of['frontend/src/App.jsx','backend/.env','backend/package-lock.json','backend/src/routes.js'])assert.throws(()=>op.validateInventory(m,[...op.PATHS,op.MANIFEST,p],read));
 const bad=structuredClone(m);bad.files[0].sha256='0'.repeat(64);assert.throws(()=>op.validateInventory(bad,[...op.PATHS,op.MANIFEST],read));
});
test('somente backend-dev reinicia, Nodes/env/pares/systemd/dumps preservados',()=>{
 const a=snapshot(),b=after(a);op.assertTransition(a,a,false);op.assertTransition(a,b,true);
 for(const mutate of[s=>s.apps[0].pid++,s=>s.apps[2].pid++,s=>s.apps[1].env='mudou',s=>s.apps[1].node='global',s=>s.infrastructure.unit='mudou',s=>s.apps[1].restarts++]){
  const bad=structuredClone(b);mutate(bad);assert.throws(()=>op.assertTransition(a,bad,true));
 }
});
test('migration antes do restart e retomada sem restart duplicado',async()=>{
 const before=snapshot(),events=[];let live=before;
 const io={assert:op.assertTransition,snapshot:()=>live,save:s=>events.push(s.phase),migrate:()=>events.push('migration-dev'),restart:()=>{events.push('restart-dev');live=after(before);},ready:()=>live};
 await op.finish({phase:'prepared',before},io);assert.deepEqual(events,['migration-dev','schema_ready','restarting','restart-dev','done']);
 events.length=0;await op.finish({phase:'restarting',before},io);assert.deepEqual(events,['done']);
 io.migrate=()=>{throw Error('schema divergente');};live=before;events.length=0;
 await assert.rejects(op.finish({phase:'prepared',before},io),/schema divergente/);assert(!events.includes('restart-dev'));
});
test('sem install, PM2 update-env ou restart de pares; QA sem rede',()=>{
 const s=fs.readFileSync(__filename.replace('.test.cjs','.cjs'),'utf8');
 assert(s.includes("[PM2_CLI,'restart','backend-dev']"));assert(!s.includes("[PM2_CLI,'restart','backend-solicitacoes']"));
 assert(!/\[PM2_CLI,\s*'(save|update|resurrect|kill)'/.test(s));assert(!s.includes("'--update-env'"));assert(s.includes('REDE_PROIBIDA_QA'));
 assert(s.includes("'scripts/autorizacaoValorDevSchema.js'"));assert(s.includes('CONFIRM_DEV_BACKUP'));
});
