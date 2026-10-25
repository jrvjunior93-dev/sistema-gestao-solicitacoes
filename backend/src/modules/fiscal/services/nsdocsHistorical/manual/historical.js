'use strict';
const {randomUUID}=require('node:crypto'),{setTimeout:delay}=require('node:timers/promises');
const {check,validateQuery,companyCnpj}=require('./policy');
const {UUID,captureManually}=require('./capture');
const {historicalPlan}=require('./plan');
const fileStore=require('./planStore');
function createPlan(input,uuid=randomUUID){
 const preview=historicalPlan(input,uuid);
 return {version:1,id:uuid(),company_id:input.companyId,company_cnpj:input.cnpj,date_field:preview.campo_data,
  start_date:input.startDate,end_date:input.endDate,jobs:preview.windows.flatMap(w=>w.lotes_iniciais.map(j=>({
   id:j.captura_id,start:w.inicio,end:w.fim,status:j.status,offset:0,state:'pending',result:null
  })))};
}
function validatePlan(p,company){
 check(p?.version===1&&UUID.test(p.id||'')&&p.company_id===company.id&&companyCnpj(p.company_cnpj)===company.cnpj
  &&Array.isArray(p.jobs)&&p.jobs.length>0&&p.jobs.length<=20000,'NSDOCS_PLANO_INVALIDO');
 check(new Set(p.jobs.map(j=>j.id)).size===p.jobs.length,'NSDOCS_PLANO_INVALIDO');
 for(const j of p.jobs){
  check(UUID.test(j.id||'')&&['pending','completed','needs_partition'].includes(j.state)
   &&j.start>=p.start_date&&j.end<=p.end_date,'NSDOCS_PLANO_INVALIDO');
  validateQuery({companyCnpj:company.cnpj,status:j.status,startDate:j.start,endDate:j.end,
   dateField:p.date_field,offset:j.offset,limit:5},{companyCnpj:company.cnpj});
 }
 return p;
}
function summary(p){return {outcome:'NSDOCS_PLANO_HISTORICO_PROD_ESTADO',plan_id:p.id,company_id:p.company_id,
 completed_batches:p.jobs.filter(j=>j.state==='completed').length,pending_batches:p.jobs.filter(j=>j.state==='pending').length,
 nfe_observations:p.jobs.reduce((n,j)=>n+Number(j.result?.documents||0),0),
 unsupported_documents:p.jobs.reduce((n,j)=>n+Number(j.result?.unsupported||0),0),
 needs_partition:p.jobs.some(j=>j.state==='needs_partition'),
 complete:p.jobs.every(j=>j.state==='completed'),application_connector_enabled:false};}
async function executePlan({planId,company,maxBatches=1,signal},d={}){
 check(Number.isInteger(maxBatches)&&maxBatches>=1&&maxBatches<=10,'NSDOCS_PLANO_LIMITE_LOTES');
 const io=d.store||fileStore,capture=d.capture||captureManually,uuid=d.uuid||randomUUID;
 const wait=d.wait||((s)=>delay(60000,undefined,{signal:s}));
 return io.withPlanLock(async()=>{
  const p=validatePlan(io.load(planId),company);let batches=0,calls=0;
  check(!p.jobs.some(j=>j.state==='needs_partition'),'NSDOCS_PLANO_EXIGE_PARTICIONAR');
  while(batches<maxBatches){
   check(!signal?.aborted,'NSDOCS_CONSULTA_CANCELADA');
   const j=p.jobs.find(j=>j.state==='pending');if(!j)break;
   if(batches)await wait(signal);
   const result=await capture({company,input:{companyCnpj:company.cnpj,status:j.status,startDate:j.start,endDate:j.end,
    dateField:p.date_field,limit:5,offset:j.offset},captureId:j.id,confirmed:true,signal});
   // O capture-id fica salvo ANTES da chamada. Falha ao salvar progresso apos
   // COMMIT e retomada pelo mesmo ID produzem replay, sem novo XML ou nota.
   j.result=result;j.state=result.partition_required?'needs_partition':'completed';
   if(result.next_offset!==null){
    check(Number.isInteger(result.next_offset)&&result.next_offset>j.offset&&result.next_offset<2000,'NSDOCS_PLANO_OFFSET_INVALIDO');
    p.jobs.splice(p.jobs.indexOf(j)+1,0,{id:uuid(),start:j.start,end:j.end,status:j.status,
     offset:result.next_offset,state:'pending',result:null});
   }
   io.save(p);batches++;calls+=result.external_nsdocs_calls;
   if(j.state==='needs_partition')break;
  }
  return {...summary(p),executed_batches:batches,external_nsdocs_calls:calls};
 });
}
module.exports={createPlan,validatePlan,summary,executePlan};
