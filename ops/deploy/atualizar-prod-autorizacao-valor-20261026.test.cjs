'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const op=require('./atualizar-prod-autorizacao-valor-20261026.cjs');
function manifest(){return{base:op.BASE,migration:'202610260001_pagamento_autorizacao_valor.js',additive_only:true,
 files:op.FILES.map(p=>({path:p,sha256:op.hash(p),old_sha256:p.includes('migration')?null:op.hash('old:'+p)})),
 extra:op.EXTRA.map(p=>({path:p,sha256:op.hash(p)}))};}
const names=()=>[...op.FILES,...op.EXTRA,op.MANIFEST],old=p=>p.includes('migration')?null:'old:'+p;
test('manifesto exato rejeita frontend, configuracao fiscal/NSDOCS, exclusao e hash alterado',()=>{
 op.inventory(manifest(),names(),p=>p,old);
 for(const file of['frontend/src/App.jsx','backend/.env','backend/src/modules/fiscal/services/fiscalS3Service.js','backend/src/modules/fiscal/services/nsdocsHistorical/manual/complement/plan.js'])
  assert.throws(()=>op.inventory(manifest(),[...names(),file],p=>p,old));
 assert.throws(()=>op.inventory(manifest(),names().slice(1),p=>p,old));
 assert.throws(()=>op.inventory(manifest(),names(),p=>p+'changed',old));
 assert.throws(()=>op.inventory(manifest(),names(),p=>p,()=>null));
 const m=manifest();m.base='0'.repeat(40);assert.throws(()=>op.inventory(m,names(),p=>p,old));
});
test('retomada de restart nao reinicia novamente um backend ja substituido',()=>{
 const initial={pid:123,restarts:7};assert(op.restartNeeded(initial,{pid:123,restarts:7}));
 assert.equal(op.restartNeeded(initial,{pid:456,restarts:8}),false);
 assert.equal(op.restartNeeded(initial,{pid:0,restarts:8}),false);
 assert.throws(()=>op.restartNeeded(initial,{pid:456,restarts:7}));
 assert.throws(()=>op.restartNeeded(initial,{pid:456,restarts:9}));
});
function snapshot(){return{daemon:'1',persisted:[['dump','hash']],apps:[
 {name:'backend-solicitacoes',pid:2,restarts:3,env:'env',envFile:'file',node:'prod'},
 {name:'backend-dev',pid:4,restarts:5,env:'dev',envFile:'dev-file',node:'dev'}]};}
test('comparacao permite so um restart PROD; DEV, ambiente, Node e dumps imutaveis',()=>{
 const a=snapshot(),b=snapshot();b.apps[0].pid=8;b.apps[0].restarts++;op.same(a,b,true);assert.throws(()=>op.same(a,b));
 for(const change of[s=>s.apps[1].pid++,s=>s.apps[1].restarts++,s=>s.apps[0].env='changed',s=>s.apps[0].node='other',s=>s.persisted[0][1]='changed',s=>s.daemon='changed']){
  const c=structuredClone(b);change(c);assert.throws(()=>op.same(a,c,true));
 }
});
test('backup, timer, manutencao e flags OFF sao exigidos',()=>{
 const env=Object.fromEntries(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_AUTORIZACAO_VALOR_PROD'].map(k=>[k,'SIM']));
 op.confirmations(env);for(const key of Object.keys(env))assert.throws(()=>op.confirmations({...env,[key]:'NAO'}));
 op.automaticOff({NSDOCS_V2_ENABLED:'false'});assert.throws(()=>op.automaticOff({NSDOCS_V2_ENABLED:'true'}));assert.throws(()=>op.automaticOff({NSDOCS_V2_FIXTURES_ENABLED:true}));
});
test('ordem arquivos, QA, schema aditivo e restart; nao publica frontend nem executa runner geral',()=>{
 const src=fs.readFileSync(__dirname+'/atualizar-prod-autorizacao-valor-20261026.cjs','utf8');
 assert(src.indexOf("qa();protectedCheck(s);doctor(s,true)")<src.indexOf("if(s.phase==='schema_pronto')"));
 assert(src.indexOf("doctor(s);save(s,'reiniciando')")<src.indexOf('await restart(s)'));
 assert(!/npm install|--update-env|\bsync\(|sequelize-cli|resurrect|CLI,'save'/.test(src));
 assert(src.includes('O_EXCL')&&src.includes('NSDOCS')&&src.includes('VALOR_PROD_CAPTURA_ATIVA'));
 assert(op.FILES.every(p=>p.startsWith('backend/')));assert(op.QA.includes('validarFilaBaixaComposta.js'));
});
test('manifesto publicado confere bytes locais e somente novos campos de auditoria',()=>{
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST),'utf8'));
 for(const f of [...m.files,...m.extra])assert.equal(op.hash(fs.readFileSync(path.join(root,f.path))),f.sha256,f.path);
 assert(m.files.filter(f=>f.path.startsWith('backend/migrations/')).length===1);
 assert(m.additive_only&&m.financial_data_writes===0&&m.nsdocs_automatic_enabled===false);
});
