'use strict';
// SOMENTE leitura do plano e historico RDS. Nao le chave, nao chama NSDOCS/S3,
// nao escreve locks, plano, historico, schema, ambiente ou PM2.
const path=require('node:path');
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function summarize(plan,history){
 const pending=plan.jobs.find(j=>j.state==='pending');
 const safe=history?.events?.map(e=>e.outcome).filter(s=>/^NSDOCS_[A-Z0-9_]{1,100}$/.test(s))||[];
 return {outcome:'NSDOCS_DIAGNOSTICO_PLANO_PROD_SOMENTE_LEITURA',plan_id:plan.id,
  completed_batches:plan.jobs.filter(j=>j.state==='completed').length,
  pending_batches:plan.jobs.filter(j=>j.state==='pending').length,
  nfe_observations:plan.jobs.reduce((n,j)=>n+Number(j.result?.documents||0),0),
  needs_partition:plan.jobs.some(j=>j.state==='needs_partition'),
  next_batch:pending?{capture_id:pending.id,start:pending.start,end:pending.end,status:pending.status,offset:pending.offset}:null,
  capture_state:history?.state||null,error_code:/^NSDOCS_[A-Z0-9_]{1,100}$/.test(history?.error_code||'')?history.error_code:null,
  page_was_persisted:safe.includes('NSDOCS_PAGINA_PERSISTIDA'),events:safe,
  external_nsdocs_calls:0,database_writes:0,storage_calls:0,credentials_read:false};
}
async function main(args,d={}){
 if(args.length!==2||args[0]!=='--plano-id'||!UUID.test(args[1]))throw Error('NSDOCS_DIAGNOSTICO_ARGUMENTOS_INVALIDOS');
 const mod=name=>require(path.join(BACKEND,'src/modules/fiscal/services/nsdocsHistorical/manual',name));
 const runtime=d.runtime||mod('runtime');
 const company=await runtime.loadProdCompany(1,'27123008000100');
 const plan=(d.validatePlan||mod('historical').validatePlan)((d.load||mod('planStore').load)(args[1]),company);
 const pending=plan.jobs.find(j=>j.state==='pending');
 let history=null;
 if(pending)history=await runtime.withProdReadDatabase(async db=>{
  const repo=(d.repository||mod('repository').createRepository)(db);await repo.preflight(company);
  try{return await repo.history(pending.id,company);}
  catch(e){if(e.code==='NSDOCS_CAPTURA_NAO_ENCONTRADA')return null;throw e;}
 });
 const out=summarize(plan,history);(d.log||console.log)(JSON.stringify(out));return out;
}
module.exports={main,summarize};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(()=>{
 console.error('NSDOCS_DIAGNOSTICO_PLANO_INTERROMPIDO_SEM_SEGREDOS');process.exitCode=1;
});
