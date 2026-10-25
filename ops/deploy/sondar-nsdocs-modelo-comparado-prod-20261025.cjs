'use strict';
// Ate2GETs: controle sem filtro e literalNF-e, com60s entre eles. Nao importa.
const path=require('node:path'),{randomUUID}=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const {setTimeout:delay}=require('node:timers/promises');
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const PLAN='c456781c-4393-468b-858f-dbf220d8f215';
const at=name=>require(path.join(BACKEND,'src/modules/fiscal/services/nsdocsHistorical',name));
function check(ok,code){if(!ok){const error=Error(code);error.code=code;throw error;}}
function compare(response,request,company,window,key,policy,normalizeResponse){
 policy.assertNoSecret(response,key);
 check(Array.isArray(response.rows)&&response.rows.length<=100&&Number.isSafeInteger(response.total)&&response.total>=0,'NSDOCS_SONDA_RESPOSTA_INVALIDA');
 let error=null,page;
 try{page=normalizeResponse(response,request,company);}catch(e){error=policy.errorCode(e);}
 const previous=new Map(window.documents.map(d=>[d.access_key,d]));
 let missing=null,extra=null,changed=null;
 if(page){
  const found=new Map(page.documents.map(d=>[d.access_key,d]));
  missing=[...previous.keys()].filter(k=>!found.has(k)).length;
  extra=[...found.keys()].filter(k=>!previous.has(k)).length;
  const identity=d=>['access_key','company_cnpj','issuer_cnpj','recipient_cnpj','number','issued_on','total_cents'].map(f=>d[f]);
  changed=[...found].filter(([k,d])=>previous.has(k)&&!isDeepStrictEqual(identity(d),identity(previous.get(k)))).length;
 }
 const other=response.rows.filter(row=>row?.modelo!=='NF-e').length;
 return {returned_rows:response.rows.length,total_header:response.total,expected_nfe_rows:previous.size,
  nfe_rows:response.rows.length-other,other_model_rows:other,normalization_error:error,
  missing_saved_nfe:missing,new_nfe_vs_saved_window:extra,identity_changes:changed,duplicate_rows:page?.duplicates??null,
  saved_nfe_set_matches:Boolean(page&&page.window_complete&&!page.duplicates&&!missing&&!extra&&!changed&&previous.size>0)};
}
async function main(args,d={}){
 check(args.length===3&&args[0]==='--plano-id'&&args[1]===PLAN&&args[2]==='--confirmar-duas-consultas-reais','NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
 const runtime=d.runtime||at('manual/runtime'),policy=d.policy||at('manual/policy'),locks=d.locks||at('manual/planStore');
 const plans=d.plans||at('manual/complement/store'),core=d.core||at('manual/complement/plan'),secrets=d.secrets||at('manual/privateStore');
 const company=await runtime.loadProdCompany(1,'27123008000100');
 const controller=new AbortController(),signal=d.signal||controller.signal,cancel=()=>controller.abort();
 if(!d.signal)for(const event of ['SIGINT','SIGTERM','SIGHUP'])process.once(event,cancel);
 try{return await locks.withPlanLock(async()=>{
  const plan=core.validate(plans.load(PLAN),company),before=JSON.stringify(plan);
  const window=plan.windows.find(w=>w.state==='enumerated'&&w.start==='2026-08-06'&&w.end==='2026-08-21'&&w.status==='Pendente'&&w.raw_count<100&&w.documents.length===70&&w.unsupported.length>0);
  check(window,'NSDOCS_SONDA_BASE_CONFERIDA_DIVERGENTE');
  const build=d.buildListRequest||at('contract').buildListRequest;
  const base=build({companyCnpj:company.cnpj,status:window.status,startDate:window.start,endDate:window.end,dateField:plan.date_field,limit:100,offset:0},company.cnpj);
  return secrets.withLock(async()=>{
   let key='',credential,calls=0;
   try{
    credential=secrets.loadCredentials();policy.verifyCompany(company,credential.companyId,credential.companyCnpj);key=credential.apiKey;credential.apiKey='';
    const once=async request=>{
     check(!signal.aborted,'NSDOCS_SONDA_CANCELADA');secrets.checkCooldown(Date.now());
     const requestId=randomUUID();let started=false;
     const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId,companyId:company.id,outcome});
     try{
      journal('NSDOCS_SONDA_MODELO_COMPARADO_INICIADA');started=true;calls++;
      const response=await(d.request||at('manual/transport').requestDocuments)(request,key,undefined,signal);
      const result=compare(response,request,company,window,key,policy,d.normalizeResponse||at('manual/query').normalizeResponse);
      check(JSON.stringify(core.validate(plans.load(PLAN),company))===before,'NSDOCS_SONDA_PLANO_MUDOU');
      journal('NSDOCS_SONDA_MODELO_COMPARADO_CONCLUIDA');started=false;return result;
     }finally{if(started)journal('NSDOCS_SONDA_MODELO_COMPARADO_INTERROMPIDA');}
    };
    const control=await once(base);let filtered=null;
    if(control.saved_nfe_set_matches){
     await(d.wait|| (s=>delay(60000,undefined,{signal:s})))(signal);
     check(!signal.aborted,'NSDOCS_SONDA_CANCELADA');
     const url=new URL(base.url);url.searchParams.set('modelo','NF-e');
     filtered=await once(Object.freeze({...base,url:url.href}));
    }
    check(JSON.stringify(core.validate(plans.load(PLAN),company))===before,'NSDOCS_SONDA_PLANO_MUDOU');
    const out={outcome:'NSDOCS_SONDA_MODELO_COMPARADO_PROD',plan_id:PLAN,start:window.start,end:window.end,status:window.status,
     control_without_model_filter:control,filtered_literal:'NF-e',filtered_result:filtered,
     model_filter_confirmed:Boolean(control.saved_nfe_set_matches&&filtered?.saved_nfe_set_matches&&filtered.other_model_rows===0),
     external_nsdocs_calls:calls,xml_downloads:0,database_writes:0,storage_calls:0,plan_changed:false,journal_events:calls*2};
    policy.assertNoSecret(out,key);(d.log||console.log)(JSON.stringify(out));return out;
   }finally{key='';if(credential)credential.apiKey='';}
  });
 });}finally{if(!d.signal)for(const event of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(event,cancel);}
}
module.exports={PLAN,compare,main};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(error=>{
 console.error(/^NSDOCS_[A-Z0-9_]{1,100}$/.test(error?.code||'')?error.code:'NSDOCS_FALHA_SANITIZADA');
 console.error('NSDOCS_SONDA_COMPARADA_INTERROMPIDA_SEM_SEGREDOS. Preserve planos/locks; nao envie valores ou XML.');process.exitCode=1;
});
