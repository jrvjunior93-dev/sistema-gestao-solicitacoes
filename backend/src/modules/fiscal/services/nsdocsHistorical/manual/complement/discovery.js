'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const {check,verifyCompany,assertNoSecret,errorCode}=require('../policy');
const {buildListRequest}=require('../../contract'),{normalizeResponse}=require('../query');
const core=require('./plan');
async function discover({planId,company,maxQueries=1,signal},d={}){
 check(Number.isInteger(maxQueries)&&maxQueries>=1&&maxQueries<=10,'NSDOCS_COMPLEMENTO_LIMITE_CONSULTAS');
 const store=d.store||require('./store'),locks=d.locks||require('../planStore'),secrets=d.secrets||require('../privateStore');
 const request=d.request||require('../transport').requestDocuments,wait=d.wait||(s=>delay(60000,undefined,{signal:s}));
 return locks.withPlanLock(async()=>{
  const plan=core.validate(store.load(planId),company);let calls=0;
  while(calls<maxQueries){
   check(!signal?.aborted,'NSDOCS_CONSULTA_CANCELADA');
   check(!plan.windows.some(w=>w.state==='needs_review'),'NSDOCS_COMPLEMENTO_REVISAO_NECESSARIA');
   const window=core.nextPending(plan);if(!window)break;
   if(calls)await wait(signal);
   const base=buildListRequest({companyCnpj:company.cnpj,status:window.status,startDate:window.start,endDate:window.end,
    dateField:plan.date_field,limit:100,offset:0},company.cnpj);
   // Filtro interno deste complemento. Nao amplia a entrada das capturas
   // legadas nem altera os hashes de idempotencia das outras CLIs.
   const url=new URL(base.url);url.searchParams.set('modelo','NF-e');
   const descriptor=Object.freeze({...base,url:url.href});
   await secrets.withLock(async()=>{
    secrets.checkCooldown(Date.now());let credentials,started=false;
    const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId:window.id,companyId:company.id,outcome});
    try{
     credentials=secrets.loadCredentials();verifyCompany(company,credentials.companyId,credentials.companyCnpj);
     journal('NSDOCS_COMPLEMENTO_DESCOBERTA_INICIADA');started=true;calls++;
     const response=await request(descriptor,credentials.apiKey,undefined,signal);assertNoSecret(response,credentials.apiKey);
     // Se o provedor ignorar/mudar o filtro, nao salvar uma cobertura presumida.
     check(Array.isArray(response.rows)&&response.rows.every(row=>row?.modelo==='NF-e'),'NSDOCS_FILTRO_MODELO_NAO_RESPEITADO');
     const page=normalizeResponse(response,descriptor,company);
     window.raw_count=page.raw_count;window.reported_total=page.total;window.query_model='NF-e';
     if(!page.window_complete){
      const children=core.split(window,d.uuid);
      check(plan.windows.length+children.length<=core.MAX_WINDOWS,'NSDOCS_COMPLEMENTO_LIMITE_JANELAS');
      plan.windows.push(...children);
     }else{
      Object.assign(window,{state:'enumerated',next_offset:null,documents:page.documents,unsupported:page.unsupported,duplicates:page.duplicates});
     }
     core.freeze(plan,d.uuid);core.validate(plan,company);store.save(plan);
     journal('NSDOCS_COMPLEMENTO_DESCOBERTA_CONCLUIDA');started=false;
     d.log?.({...core.summary(plan),external_nsdocs_calls:calls});
    }catch(error){if(started)journal(errorCode(error));throw error;}
    finally{if(credentials)credentials.apiKey='';}
   });
   if(plan.windows.some(w=>w.state==='needs_review'))break;
  }
  core.freeze(plan,d.uuid);store.save(core.validate(plan,company));
  return {...core.summary(plan),external_nsdocs_calls:calls,database_writes:0,xml_downloads_this_run:0};
 });
}
module.exports={discover};
