'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const op=require('./atualizar-dev-cartao-repetido-20261027.cjs');
function snapshot(){return{infrastructure:{daemon:1,dumps:['hash'],unit:'isolado'},apps:[
 {name:'backend-solicitacoes',pid:10,node:'prod',env:'hash',uptime:1,restarts:1},
 {name:'backend-dev',pid:20,node:'dev',env:'hash',uptime:1,restarts:1},
 {name:'fluxy-experience-api',pid:30,node:'experience',env:'hash',uptime:1,restarts:1}]};}
function after(value){const result=structuredClone(value);Object.assign(result.apps[1],{pid:21,uptime:2,restarts:2});return result;}
test('somente revisoes DEV revisadas sao aceitas',()=>{
 for(const head of [op.BASE,op.PREVIOUS_BACKEND,'target'])op.validateStartingHead(head,'target');
 assert.throws(()=>op.validateStartingHead('main','target'));
});
test('manifesto com inventario e hashes estritos; recusar frontend, segredo ou arquivo extra',()=>{
 const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p));
 const manifest=JSON.parse(read(op.MANIFEST));op.validateInventory(manifest,[...op.PATHS,op.MANIFEST],read);
 for(const file of ['backend/.env','backend/package-lock.json','backend/src/routes.js','frontend/src/App.jsx'])
  assert.throws(()=>op.validateInventory(manifest,[...op.PATHS,op.MANIFEST,file],read));
 const bad=structuredClone(manifest);bad.files[0].sha256='0'.repeat(64);
 assert.throws(()=>op.validateInventory(bad,[...op.PATHS,op.MANIFEST],read));
 assert(op.DEPLOY.every(file=>!file.startsWith('frontend/')));
});
test('aceitar apenas um restart DEV, com PROD/Experience/daemon/env/Nodes/dumps preservados',()=>{
 const before=snapshot(),next=after(before);op.assertTransition(before,before,false);op.assertTransition(before,next,true);
 for(const change of [s=>s.apps[0].pid++,s=>s.apps[2].pid++,s=>s.apps[1].env='outro',
  s=>s.apps[1].node='global',s=>s.infrastructure.unit='outro',s=>s.infrastructure.dumps=[],s=>s.apps[1].restarts++]){
  const bad=structuredClone(next);change(bad);assert.throws(()=>op.assertTransition(before,bad,true));
 }
});
test('arquivos e QA antes do restart; retomada nao repete restart',async()=>{
 const before=snapshot(),events=[];let live=before;
 const io={assert:op.assertTransition,snapshot:()=>live,save:s=>events.push(s.phase),
  install:()=>events.push('install-files'),qa:()=>events.push('qa'),restart:()=>{events.push('restart-dev');live=after(before);},ready:()=>live};
 await op.finish({phase:'prepared',before},io);
 assert.deepEqual(events,['install-files','qa','files_ready','restarting','restart-dev','done']);
 events.length=0;await op.finish({phase:'restarting',before},io);assert.deepEqual(events,['done']);
 events.length=0;await op.finish({phase:'done',before},io);assert.deepEqual(events,['done']);
 live=before;events.length=0;io.qa=()=>{throw Error('QA falhou');};
 await assert.rejects(op.finish({phase:'prepared',before},io),/QA falhou/);assert(!events.includes('restart-dev'));
});
test('falha de restart fica pendente e retomada incerta nao reinicia novamente',async()=>{
 const before=snapshot(),saved=[];let restarts=0;
 const io={assert:op.assertTransition,snapshot:()=>before,save:s=>saved.push(s.phase),install:()=>{},qa:()=>{},
  restart:()=>{restarts++;throw Error('resposta perdida');},ready:()=>before};
 await assert.rejects(op.finish({phase:'files_ready',before},io),/resposta perdida/);
 assert.deepEqual(saved,['restarting']);
 await assert.rejects(op.finish({phase:'restarting',before},io),/RESTART|PROCESSO_NODE/);assert.equal(restarts,1);
});
test('somente arquivos selecionados, sem migration/SQL/install/PM2 global ou checkout amplo',()=>{
 const source=fs.readFileSync(path.join(__dirname,'atualizar-dev-cartao-repetido-20261027.cjs'),'utf8');
 assert(source.includes("[PM2_CLI,'restart','backend-dev']"));
 assert(!/\[PM2_CLI,\s*'(save|update|resurrect|kill)'/.test(source));
 assert(!source.includes("'--update-env'"));assert(!source.includes("[PM2_CLI,'restart','backend-solicitacoes']"));
 assert(source.includes('semRedeQa.js'));assert(source.includes('CONFIRM_DEV_BACKUP'));
 assert(!/git\(\[\s*['"](?:merge|checkout|reset|clean|pull)['"]/.test(source));
 assert(!/npm (?:install|ci)|sequelize\.query|createConnection|migrations:run|doctor\(/.test(source));
 assert(!op.DEPLOY.some(file=>/migration|\.env|lock\.json|frontend\//.test(file)));
});
