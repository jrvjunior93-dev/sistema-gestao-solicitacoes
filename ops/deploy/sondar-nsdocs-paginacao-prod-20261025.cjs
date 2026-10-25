'use strict';
// Um GET de listagem (offset 5), executado somente com confirmacao explicita.
// Sem captura, XML, escrita RDS/S3 ou edicao do plano. Dois eventos no journal
// privado e locks temporarios preservam auditoria, cooldown e exclusao mutua.
const path=require('node:path'),{randomUUID}=require('node:crypto');
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const PLAN='8e0a4179-506a-4670-88a2-d9079728e263';
const check=(v,c)=>{if(!v){const e=Error(c);e.code=c;throw e;}};
const json=v=>typeof v==='string'?JSON.parse(v):v;
const moduleAt=name=>require(path.join(BACKEND,'src/modules/fiscal/services/nsdocsHistorical/manual',name));
function summarize(response,page,request,company,key,policy){
 policy.assertNoSecret(response,key);
 check(Array.isArray(response.rows)&&response.rows.length<=5&&Number.isSafeInteger(response.total)&&response.total>=0,'NSDOCS_SONDA_PAGINA_INVALIDA');
 const previous=new Set([...page.documents,...page.unsupported].map(d=>String(d.provider_id)));
 const ids=new Set();let overlap=0;
 for(const row of response.rows){
  check(row&&policy.companyCnpj(row.empresa_cnpj)===company.cnpj&&row.status===request.status,'NSDOCS_SONDA_EMPRESA_OU_STATUS_DIVERGENTE');
  const id=String(row.id);
  check(/^[A-Za-z0-9_-]{1,64}$/.test(id)&&!ids.has(id),'NSDOCS_SONDA_ID_INVALIDO');
  ids.add(id);if(previous.has(id))overlap++;
 }
 return {returned_rows:response.rows.length,total_header:response.total,
  first_page_rows:page.raw_count,first_page_total:page.total,
  overlap_with_saved_first_page:overlap,new_provider_ids_vs_first_page:ids.size-overlap};
}
async function main(args,d={}){
 check(args.length===3&&args[0]==='--plano-id'&&args[1]===PLAN&&args[2]==='--confirmar-consulta-real','NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
 const runtime=d.runtime||moduleAt('runtime'),policy=d.policy||moduleAt('policy');
 const plans=d.plans||moduleAt('planStore'),secrets=d.store||moduleAt('privateStore');
 const company=await runtime.loadProdCompany(1,'27123008000100');
 return plans.withPlanLock(async()=>{
  const validate=d.validatePlan||moduleAt('historical').validatePlan;
  const plan=validate(plans.load(PLAN),company),before=JSON.stringify(plan);
  check(plan.jobs.every(j=>j.state==='completed'),'NSDOCS_SONDA_PLANO_NAO_CONCLUIDO');
  const job=plan.jobs.find(j=>j.start==='2026-01-01'&&j.end==='2026-01-31'&&j.status==='Pendente'&&j.offset===0);
  check(job,'NSDOCS_SONDA_JANELA_DIVERGENTE');
  const row=await (d.readCapture|| (async id=>runtime.withProdReadDatabase(async db=>{
   const [rows]=await db.execute('SELECT request_json,page_json,state FROM fiscal_nsdocs_captures WHERE id=? AND empresa_id=? AND company_cnpj=?',[id,company.id,company.cnpj]);
   check(rows.length===1,'NSDOCS_SONDA_CAPTURA_AUSENTE');return rows[0];
  })))(job.id);
  const saved=json(row.request_json),page=json(row.page_json);
  check(row.state==='completed'&&saved.limit===5&&saved.offset===0&&saved.status===job.status&&saved.startDate===job.start&&saved.endDate===job.end&&saved.dateField===plan.date_field
   &&page.raw_count===5&&page.total===5&&page.next_offset===null&&Array.isArray(page.documents)&&Array.isArray(page.unsupported),'NSDOCS_SONDA_BASE_DIVERGENTE');
  const request=policy.validateQuery({companyCnpj:company.cnpj,startDate:job.start,endDate:job.end,dateField:plan.date_field,status:job.status,limit:5,offset:5},{companyCnpj:company.cnpj});
  return secrets.withLock(async()=>{
   secrets.checkCooldown(Date.now());const requestId=randomUUID();let key='',started=false;
   const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId,companyId:company.id,outcome});
   try{
    const c=secrets.loadCredentials();policy.verifyCompany(company,c.companyId,c.companyCnpj);key=c.apiKey;c.apiKey='';
    journal('NSDOCS_SONDA_PAGINACAO_INICIADA');started=true;
    const response=await(d.request||moduleAt('transport').requestDocuments)(request,key);
    const result=summarize(response,page,request,company,key,policy);
    check(JSON.stringify(validate(plans.load(PLAN),company))===before,'NSDOCS_SONDA_PLANO_MUDOU');
    journal('NSDOCS_SONDA_PAGINACAO_CONCLUIDA');started=false;
    const out={outcome:'NSDOCS_SONDA_PAGINACAO_PROD',plan_id:PLAN,start:job.start,end:job.end,status:job.status,offset:5,limit:5,...result,
     external_nsdocs_calls:1,xml_downloads:0,database_writes:0,storage_calls:0,plan_changed:false,journal_events:2};
    policy.assertNoSecret(out,key);(d.log||console.log)(JSON.stringify(out));return out;
   }finally{key='';if(started)journal('NSDOCS_SONDA_PAGINACAO_INTERROMPIDA');}
  });
 });
}
module.exports={main,summarize,PLAN};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(()=>{
 console.error('NSDOCS_SONDA_PAGINACAO_INTERROMPIDA_SEM_SEGREDOS');process.exitCode=1;
});
