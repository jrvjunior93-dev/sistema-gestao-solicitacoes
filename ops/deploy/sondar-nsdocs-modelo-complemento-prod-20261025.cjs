'use strict';
// Um GET filtrado de uma janela ja enumerada; comparacao sem expor notas/chaves.
const path=require('node:path'),{randomUUID}=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const PLAN='c456781c-4393-468b-858f-dbf220d8f215';
const at=name=>require(path.join(BACKEND,'src/modules/fiscal/services/nsdocsHistorical',name));
function check(ok,code){if(!ok){const e=Error(code);e.code=code;throw e;}}
function summarize(response,request,company,window,key,policy,normalizeResponse){
 policy.assertNoSecret(response,key);
 check(Array.isArray(response.rows)&&response.rows.length<=100&&Number.isSafeInteger(response.total)&&response.total>=0,'NSDOCS_SONDA_RESPOSTA_INVALIDA');
 let error=null,page;
 try{page=normalizeResponse(response,request,company);}catch(e){error=policy.errorCode(e);}
 const previous=new Map(window.documents.map(d=>[d.access_key,d]));
 let missing=null,extra=null,identityChanges=null;
 if(page){
  const found=new Map(page.documents.map(d=>[d.access_key,d]));
  missing=[...previous.keys()].filter(k=>!found.has(k)).length;
  extra=[...found.keys()].filter(k=>!previous.has(k)).length;
  const identity=d=>['access_key','company_cnpj','issuer_cnpj','recipient_cnpj','number','issued_on','total_cents'].map(f=>d[f]);
  identityChanges=[...found].filter(([k,d])=>previous.has(k)&&!isDeepStrictEqual(identity(d),identity(previous.get(k)))).length;
 }
 const other=response.rows.filter(row=>row?.modelo!=='NF-e').length;
 return {returned_rows:response.rows.length,total_header:response.total,expected_nfe_rows:previous.size,
  nfe_rows:response.rows.length-other,other_model_rows:other,normalization_error:error,
  missing_saved_nfe:missing,new_nfe_vs_saved_window:extra,identity_changes:identityChanges,
  duplicate_rows:page?.duplicates??null,
  model_filter_confirmed:Boolean(page&&page.window_complete&&!page.duplicates&&!other&&!missing&&!extra&&!identityChanges&&previous.size>0)};
}
async function main(args,d={}){
 check(args.length===3&&args[0]==='--plano-id'&&args[1]===PLAN&&args[2]==='--confirmar-consulta-real','NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
 const runtime=d.runtime||at('manual/runtime'),policy=d.policy||at('manual/policy'),locks=d.locks||at('manual/planStore');
 const plans=d.plans||at('manual/complement/store'),core=d.core||at('manual/complement/plan'),secrets=d.secrets||at('manual/privateStore');
 const company=await runtime.loadProdCompany(1,'27123008000100');
 return locks.withPlanLock(async()=>{
  const plan=core.validate(plans.load(PLAN),company),before=JSON.stringify(plan);
  const window=plan.windows.find(w=>w.state==='enumerated'&&w.raw_count<100&&w.documents.length>0&&w.unsupported.length>0);
  check(window,'NSDOCS_SONDA_SEM_JANELA_MISTA_CONFERIDA');
  const build=d.buildListRequest||at('contract').buildListRequest;
  const base=build({companyCnpj:company.cnpj,status:window.status,startDate:window.start,endDate:window.end,dateField:plan.date_field,limit:100,offset:0},company.cnpj);
  const url=new URL(base.url);url.searchParams.set('modelo','nfe');const request=Object.freeze({...base,url:url.href});
  return secrets.withLock(async()=>{
   secrets.checkCooldown(Date.now());const requestId=randomUUID();let key='',credential,started=false;
   const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId,companyId:company.id,outcome});
   try{
    credential=secrets.loadCredentials();policy.verifyCompany(company,credential.companyId,credential.companyCnpj);key=credential.apiKey;credential.apiKey='';
    journal('NSDOCS_SONDA_MODELO_INICIADA');started=true;
    const response=await(d.request||at('manual/transport').requestDocuments)(request,key);
    const result=summarize(response,request,company,window,key,policy,d.normalizeResponse||at('manual/query').normalizeResponse);
    check(JSON.stringify(core.validate(plans.load(PLAN),company))===before,'NSDOCS_SONDA_PLANO_MUDOU');
    const out={outcome:'NSDOCS_SONDA_MODELO_COMPLEMENTO_PROD',plan_id:PLAN,start:window.start,end:window.end,status:window.status,
     model_filter:'nfe',limit:100,offset:0,...result,external_nsdocs_calls:1,xml_downloads:0,database_writes:0,storage_calls:0,plan_changed:false,journal_events:2};
    policy.assertNoSecret(out,key);journal('NSDOCS_SONDA_MODELO_CONCLUIDA');started=false;(d.log||console.log)(JSON.stringify(out));return out;
   }finally{key='';if(credential)credential.apiKey='';if(started)journal('NSDOCS_SONDA_MODELO_INTERROMPIDA');}
  });
 });
}
module.exports={PLAN,summarize,main};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(error=>{
 console.error(/^NSDOCS_[A-Z0-9_]{1,100}$/.test(error?.code||'')?error.code:'NSDOCS_FALHA_SANITIZADA');
 console.error('NSDOCS_SONDA_MODELO_INTERROMPIDA_SEM_SEGREDOS. Preserve planos/locks; nao envie valores ou XML.');process.exitCode=1;
});
