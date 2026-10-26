'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const op=require('./atualizar-prod-sc-vale-20261026.cjs');
function manifest(){return {base:op.BASE,migration:'202610260002_compra_reorganizacao_reversivel.js',additive_only:true,
 files:op.FILES.map(p=>({path:p,sha256:op.hash(p),old_sha256:op.hash('old:'+p)})),extra:op.EXTRA.map(p=>({path:p,sha256:op.hash(p)}))};}
function snapshot(){return {daemon:'1',persisted:[['dump','hash']],apps:[
 {name:'backend-solicitacoes',pid:2,restarts:3,env:'env',envFile:'file',node:'prod'},
 {name:'backend-dev',pid:4,restarts:5,env:'dev',envFile:'dev-file',node:'dev'},
 {name:'fluxy-experience-api',pid:6,restarts:1,env:'experience',node:'experience'}]};}
test('inventario permite somente pacote backend fechado; frontend, cheques, financeiro e hash alterado recusados',()=>{
 const names=[...op.FILES,...op.EXTRA,op.MANIFEST];op.inventory(manifest(),names,p=>p,p=>'old:'+p);
 for(const p of ['frontend/src/components/rh/RhDpPagamentoModal.jsx','backend/.env','backend/src/services/chequesLegadosRegularizacaoService.js','backend/src/services/pagamentoManualFilaService.js','backend/package.json'])assert.throws(()=>op.inventory(manifest(),[...names,p],p=>p,p=>'old:'+p));
 assert.throws(()=>op.inventory(manifest(),names.slice(1),p=>p,p=>'old:'+p));
 assert.throws(()=>op.inventory(manifest(),names,p=>p+'bad',p=>'old:'+p));
 assert.throws(()=>op.inventory(manifest(),names,p=>p,()=>null));
});
test('bases conhecidas preservadas e backlog limitado ao catalogo ja publicado',()=>{
 for(const h of op.STARTING_HEADS)op.startingHead(h,'target',['backend/src/generated/navegacaoFonteUnica.cjs']);
 op.startingHead('target','target',[]);assert.throws(()=>op.startingHead('unknown','target',[]));
 assert.throws(()=>op.startingHead(op.BASE,'target',['backend/src/routes.js']));
});
test('somente um restart PROD; Nodes/env/DEV/Experience/daemon/dumps preservados',()=>{
 const a=snapshot(),b=structuredClone(a);b.apps[0].pid=8;b.apps[0].restarts++;op.same(a,b,true);assert.throws(()=>op.same(a,b));
 for(const mutate of [s=>s.apps[1].pid++,s=>s.apps[2].pid++,s=>s.apps[0].restarts++,s=>s.apps[0].env='other',s=>s.apps[0].envFile='other',s=>s.apps[0].node='other',s=>s.persisted[0][1]='other',s=>s.daemon='other']){const bad=structuredClone(b);mutate(bad);assert.throws(()=>op.same(a,bad,true));}
 assert(op.restartNeeded({pid:1,restarts:3},{pid:1,restarts:3}));assert.equal(op.restartNeeded({pid:1,restarts:3},{pid:8,restarts:4}),false);
 assert.throws(()=>op.restartNeeded({pid:1,restarts:3},{pid:8,restarts:5}));
});
test('backup, timer, manutencao, schema e automatico desligado exigidos',()=>{
 const e=Object.fromEntries(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_SC_VALE_PROD'].map(k=>[k,'SIM']));op.confirmations(e);
 for(const k of Object.keys(e))assert.throws(()=>op.confirmations({...e,[k]:'NAO'}));
 op.automaticOff({NSDOCS_V2_ENABLED:'false'});assert.throws(()=>op.automaticOff({NSDOCS_V2_ENABLED:'true'}));
});
test('QA e schema antes do restart; falha na migration bloqueia restart e retomada nao repete schema',async()=>{
 const events=[],io={qa:()=>events.push('qa'),protected:()=>events.push('protegidos'),migrate:()=>events.push('migration'),verifySchema:()=>events.push('conferir-schema'),restart:()=>events.push('restart'),verifyReady:()=>events.push('health'),save:(s,p)=>{s.phase=p;events.push(p);}};
 await op.finish({phase:'arquivos_prontos'},io);assert.deepEqual(events,['qa','protegidos','migration','protegidos','schema_pronto','conferir-schema','reiniciando','restart','health','aplicado']);
 events.length=0;await op.finish({phase:'reiniciando'},io);assert.deepEqual(events,['restart','health','aplicado']);
 events.length=0;await assert.rejects(op.finish({phase:'arquivos_prontos'},{...io,migrate:()=>{throw Error('QA_FALHA_SCHEMA');}}),/QA_FALHA_SCHEMA/);assert(!events.includes('restart'));
});
test('nao executa cancelamentos, CLI de lote, install, runner geral ou PM2 save/update-env',()=>{
 const s=fs.readFileSync(__filename.replace('.test.cjs','.cjs'),'utf8');
 assert(!/npm install|--update-env|sequelize-cli|resurrect|CLI,'save'|\bsync\(/.test(s));
 assert(!/run\(NODE,\s*\[['"]scripts\/compraReorganizacaoHttp/.test(s));
 assert(s.includes("'scripts/compraReorganizacaoProdSchema.js'"));assert(s.includes("CONFIRM_SC_REVERSIVEL_PROD_SCHEMA:'SIM'"));
 assert(s.includes('O_EXCL')&&s.includes('SC_VALE_PROD_CAPTURA_ATIVA'));
 assert(op.FILES.every(p=>p.startsWith('backend/')));
});
test('manifesto local coincide byte a byte; apenas uma migration aditiva de journal',()=>{
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST),'utf8'));
 for(const f of [...m.files,...m.extra])assert.equal(op.hash(fs.readFileSync(path.join(root,f.path))),f.sha256,f.path);
 assert.equal(m.files.filter(f=>f.path.startsWith('backend/migrations/')).length,1);
 assert(m.additive_only&&m.cancelamentos_executados===0&&m.financial_data_writes===0&&m.nsdocs_automatic_enabled===false);
});
