'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const {check,verifyCompany,assertNoSecret,errorCode}=require('../policy');
const {withCaptureResources}=require('../capture'),{validateNfeXml}=require('../xml');
const core=require('./plan');

async function captureBatch({plan,batch,company,signal},d={}){
 core.validate(plan,company);
 check(plan.manifest_hash&&plan.batches.includes(batch)&&batch.count>=1&&batch.count<=5,'NSDOCS_COMPLEMENTO_LOTE_INVALIDO');
 const docs=plan.documents.slice(batch.start,batch.start+batch.count),secrets=d.secrets||require('../privateStore');
 return withCaptureResources({company,signal},d,async({repo,storage,fiscalCompanyId,signal:abort,config})=>secrets.withLock(async()=>{
  await repo.lock();let begun=false,credentials,started=false,finished=false,calls=0,reused=0,resumed=0;
  const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId:batch.id,companyId:company.id,outcome});
  try{
   const input={companyId:company.id,companyCnpj:company.cnpj,fiscalCompanyId,manifest_hash:plan.manifest_hash,
    complement_id:plan.id,source_id:plan.source_id,batch:batch.start,keys:docs.map(doc=>doc.access_key),storage:config,actor:'ubuntu:1000'};
   const run=await repo.begin({id:batch.id,company,fiscalCompanyId,hash:core.hash(input),input});begun=true;
   if(run.result)return {...run.result,replayed:true,external_nsdocs_calls:0};
   if(!run.page)await repo.savePage(batch.id,{documents:docs,unsupported:[],raw_count:docs.length,total:docs.length,next_offset:null,window_complete:true,partition_required:false,manifest_hash:plan.manifest_hash});
   for(const doc of docs){
    check(!abort.aborted,'NSDOCS_CONSULTA_CANCELADA');
    if(await repo.observed(batch.id,doc.access_key)){resumed++;continue;}
    let stored=await repo.reusableXml(doc,company,fiscalCompanyId);
    if(stored){reused++;await repo.event(batch.id,'NSDOCS_XML_REUTILIZADO');}
    else{
     if(!credentials){credentials=secrets.loadCredentials();verifyCompany(company,credentials.companyId,credentials.companyCnpj);}
     if(!started){secrets.checkCooldown(Date.now());journal('NSDOCS_COMPLEMENTO_XML_INICIADO');started=true;}
     await repo.event(batch.id,'NSDOCS_XML_DOWNLOAD_INICIADO');calls++;
     const body=await(d.xml||require('../transport').requestXml)(doc,credentials.apiKey,undefined,abort);
     assertNoSecret(body.toString('utf8'),credentials.apiKey);
     const checked=validateNfeXml(body,doc,credentials.apiKey);
     stored=await storage.put(doc,body,abort);
     check(stored.bucket===config.bucket&&stored.hash===checked.hash,'NSDOCS_STORAGE_OBJETO_DIVERGENTE');
    }
    await repo.saveDocument({id:batch.id,company,fiscalCompanyId,doc,xml:stored});
   }
   const result={outcome:'NSDOCS_COMPLEMENTO_LOTE_CONCLUIDO',capture_id:batch.id,plan_id:plan.id,documents:docs.length,
    xmls:docs.length,xml_downloads:calls,reused_xmls:reused,resumed_documents:resumed,external_nsdocs_calls:calls,
    next_offset:null,partition_required:false,window_complete:true,persisted:true,replayed:false,
    xml_validation:'identity_checked_signature_unverified',application_connector_enabled:false};
   if(credentials)assertNoSecret(result,credentials.apiKey);
   if(started){journal('NSDOCS_COMPLEMENTO_XML_CONCLUIDO');finished=true;}
   await repo.complete(batch.id,result);return result;
  }catch(error){
   const code=errorCode(error);
   if(started&&!finished){try{journal(code);}catch{}}
   if(begun)try{await repo.fail(batch.id,code);}catch{check(false,'NSDOCS_CAPTURA_AUDITORIA_INDISPONIVEL');}
   const safe=Error(code);safe.code=code;throw safe;
  }finally{if(credentials)credentials.apiKey='';await repo.unlock();}
 }));
}
async function capture({planId,company,maxBatches=1,signal},d={}){
 check(Number.isInteger(maxBatches)&&maxBatches>=1&&maxBatches<=10,'NSDOCS_PLANO_LIMITE_LOTES');
 const store=d.store||require('./store'),locks=d.locks||require('../planStore'),wait=d.wait||(s=>delay(60000,undefined,{signal:s}));
 return locks.withPlanLock(async()=>{
  const plan=core.validate(store.load(planId),company);
  check(plan.manifest_hash&&!core.summary(plan).needs_review,'NSDOCS_COMPLEMENTO_ENUMERACAO_PENDENTE');
  let executed=0,calls=0;
  while(executed<maxBatches){
   check(!signal?.aborted,'NSDOCS_CONSULTA_CANCELADA');
   const batch=plan.batches.find(b=>b.state==='pending');if(!batch)break;
   if(executed)await wait(signal);
   const result=await(d.captureBatch||captureBatch)({plan,batch,company,signal},d);
   batch.result=result;batch.state='completed';store.save(core.validate(plan,company));
   executed++;calls+=result.external_nsdocs_calls;
   d.log?.({...core.summary(plan),executed_batches:executed,external_nsdocs_calls:calls});
  }
  return {...core.summary(plan),executed_batches:executed,external_nsdocs_calls:calls};
 });
}
module.exports={capture,captureBatch};
