'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPlan,executePlan,validatePlan}=require('../src/modules/fiscal/services/nsdocsHistorical/manual/historical');
const {main,parseOptions}=require('./nsdocsProdCapture');
const company={id:1,cnpj:'11222333000181'};
function fixture(){
 const p=createPlan({companyId:1,cnpj:company.cnpj,startDate:'2026-09-01',endDate:'2026-10-15'});
 let disk=JSON.stringify(p),locked=false,fail=false,network=0,waits=0;const durable=new Map();
 const store={load:()=>JSON.parse(disk),save:p=>{if(fail)throw Error('DISCO_FICTICIO');disk=JSON.stringify(p);},
  withPlanLock:async fn=>{if(locked)throw Error('OCUPADO');locked=true;try{return await fn();}finally{locked=false;}}};
 const capture=async({captureId,input})=>{
  if(durable.has(captureId))return {...durable.get(captureId),external_nsdocs_calls:0,replayed:true};
  network++;const result={external_nsdocs_calls:2,partition_required:false,next_offset:input.offset===0?5:null,window_complete:input.offset!==0};
  durable.set(captureId,result);return result;
 };
 const run=(maxBatches=1,extra={})=>executePlan({planId:p.id,company,maxBatches}, {store,capture,wait:async()=>{waits++;},...extra});
 return {p,store,capture,run,disk:()=>JSON.parse(disk),calls:()=>network,waits:()=>waits,setFail:v=>{fail=v;}};
}
test('carga manual percorre paginacao e ambos status/janelas, com IDs duraveis e limite por execucao',async()=>{
 const f=fixture();let r=await f.run();assert.equal(r.executed_batches,1);assert.equal(r.complete,false);
 const next=f.disk().jobs[1];assert.equal(next.offset,5);assert.equal(next.status,'Pendente');
 r=await f.run(10);assert.equal(r.complete,true);assert.equal(f.calls(),8);
 assert.equal(f.disk().jobs.filter(j=>j.status==='Importado').length,4);assert(f.waits()>0);
 const previous=f.calls();r=await f.run(10);assert.equal(r.executed_batches,0);assert.equal(r.external_nsdocs_calls,0);assert.equal(f.calls(),previous);
});
test('falha de disco apos captura duravel retoma mesmo ID sem nova chamada e sem perder proxima pagina',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.run(),/DISCO/);assert.equal(f.calls(),1);
 assert.equal(f.disk().jobs[0].state,'pending');f.setFail(false);
 const r=await f.run();assert.equal(r.external_nsdocs_calls,0);assert.equal(f.calls(),1);assert.equal(f.disk().jobs[1].offset,5);
});
test('falha no segundo lote preserva progresso anterior; retomada nao repete primeiro',async()=>{
 const f=fixture();let n=0;
 await assert.rejects(f.run(3,{capture:async o=>{if(++n===2)throw Error('FALHA_FICTICIA');return f.capture(o);}}),/FALHA/);
 assert.equal(f.disk().jobs[0].state,'completed');assert.equal(f.disk().jobs[1].state,'pending');
 await f.run();assert.equal(f.disk().jobs[1].state,'completed');assert.equal(f.calls(),2);
});
test('particionamento para limite do provedor impede falso concluido e novas chamadas ate revisao',async()=>{
 const f=fixture();const r=await f.run(10,{capture:async()=>({external_nsdocs_calls:1,partition_required:true,next_offset:null})});
 assert.equal(r.needs_partition,true);assert.equal(r.complete,false);assert.equal(r.executed_batches,1);
 await assert.rejects(f.run(),/PARTICIONAR/);
});
test('cancelamento e concorrencia param sem criar execucoes; outro CNPJ e plano adulterado recusados',async()=>{
 const f=fixture();const controller=new AbortController();controller.abort();
 await assert.rejects(executePlan({planId:f.p.id,company,signal:controller.signal},{store:f.store,capture:f.capture}),/CANCELADA/);
 assert.equal(f.calls(),0);
 await assert.rejects(f.store.withPlanLock(()=>f.run()),/OCUPADO/);
 assert.throws(()=>validatePlan(f.p,{id:2,cnpj:company.cnpj}),/INVALIDO/);
 const bad=structuredClone(f.p);bad.jobs[1].id=bad.jobs[0].id;assert.throws(()=>validatePlan(bad,company),/INVALIDO/);
});
test('CLI limita execucao a10 lotes e exige tres confirmacoes; consulta do plano nao grava nem chama NSDOCS',async()=>{
 const f=fixture(),base=['--empresa-id','1','--cnpj',company.cnpj,'--plano-id',f.p.id];
 assert.throws(()=>parseOptions([...base,'--executar-plano']));
 const args=[...base,'--executar-plano','--confirmar-chamada-real','--confirmar-persistencia','--confirmar-status-xml'];
 assert.equal(parseOptions(args).maxBatches,1);assert.throws(()=>parseOptions([...args,'--max-lotes','11']));
 let result;await main([...base,'--consultar-plano'],{loadCompany:async()=>company,plans:f.store,log:r=>{result=r;}});
 assert.equal(result.pending_batches,4);assert.equal(result.external_nsdocs_calls,0);
});
