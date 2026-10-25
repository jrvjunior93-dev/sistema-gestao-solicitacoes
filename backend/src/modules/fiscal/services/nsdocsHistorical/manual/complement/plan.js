'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {check}=require('../policy');
const {UUID}=require('../capture');
const {isoDate}=require('../../contract');
const MAX_DOCUMENTS=10000,MAX_WINDOWS=20000;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const identity=d=>[d.access_key,d.company_cnpj,d.issuer_cnpj,d.recipient_cnpj,d.number,d.issued_on,d.total_cents];
function create(parent,sourceKeys,uuid=randomUUID){
 check(parent.jobs.every(j=>j.state==='completed')&&sourceKeys.length>0&&sourceKeys.length<=MAX_DOCUMENTS,'NSDOCS_COMPLEMENTO_ORIGEM_INCOMPLETA');
 const groups=new Map();
 for(const j of parent.jobs)groups.set([j.start,j.end,j.status].join('|'),{id:uuid(),start:j.start,end:j.end,status:j.status,state:'pending'});
 return {version:2,kind:'nsdocs_complement',id:uuid(),source_id:parent.id,company_id:parent.company_id,company_cnpj:parent.company_cnpj,
  start_date:parent.start_date,end_date:parent.end_date,date_field:parent.date_field,source_keys:[...new Set(sourceKeys)].sort(),
  windows:[...groups.values()],documents:[],batches:[],manifest_hash:null};
}
function split(window,uuid=randomUUID){
 if(window.start===window.end){window.state='needs_review';window.reason='DIA_CHEIO_SEM_ENUMERACAO_CONFIAVEL';return [];}
 const day=86400000,start=Date.parse(window.start),end=Date.parse(window.end),middle=start+Math.floor((end-start)/day/2)*day;
 const date=n=>new Date(n).toISOString().slice(0,10);
 window.state='split';
 return [{id:uuid(),start:window.start,end:date(middle),status:window.status,state:'pending',parent:window.id},
  {id:uuid(),start:date(middle+day),end:window.end,status:window.status,state:'pending',parent:window.id}];
}
function manifest(plan){
 const docs=new Map();
 for(const w of plan.windows.filter(w=>w.state==='enumerated'))for(const d of w.documents){
  const old=docs.get(d.access_key);
  if(old)check(canonical(identity(old))===canonical(identity(d)),'NSDOCS_COMPLEMENTO_IDENTIDADE_CONFLITANTE');
  else docs.set(d.access_key,d);
 }
 check(docs.size<=MAX_DOCUMENTS,'NSDOCS_COMPLEMENTO_LIMITE_DOCUMENTOS');
 return [...docs.values()].sort((a,b)=>a.access_key.localeCompare(b.access_key));
}
function digest(plan){return hash({source_id:plan.source_id,company_id:plan.company_id,company_cnpj:plan.company_cnpj,date_field:plan.date_field,
 source_keys:plan.source_keys,windows:plan.windows,documents:plan.documents});}
function freeze(plan,uuid=randomUUID){
 if(plan.manifest_hash||plan.windows.some(w=>!['enumerated','split'].includes(w.state)))return;
 plan.documents=manifest(plan);plan.manifest_hash=digest(plan);
 for(let i=0;i<plan.documents.length;i+=5)plan.batches.push({id:uuid(),start:i,count:Math.min(5,plan.documents.length-i),state:'pending',result:null});
}
function validate(plan,company){
 check(plan?.version===2&&plan.kind==='nsdocs_complement'&&UUID.test(plan.id||'')&&UUID.test(plan.source_id||'')
  &&plan.company_id===company.id&&plan.company_cnpj===company.cnpj&&['data_emissao','data_recebimento'].includes(plan.date_field)
  &&Array.isArray(plan.windows)&&plan.windows.length>0&&plan.windows.length<=MAX_WINDOWS
  &&Array.isArray(plan.source_keys)&&plan.source_keys.length>0&&plan.source_keys.every(k=>/^\d{44}$/.test(k))&&plan.source_keys.length<=MAX_DOCUMENTS
  &&new Set(plan.source_keys).size===plan.source_keys.length&&plan.source_id!==plan.id
  &&Array.isArray(plan.documents)&&plan.documents.length<=MAX_DOCUMENTS&&Array.isArray(plan.batches),'NSDOCS_COMPLEMENTO_PLANO_INVALIDO');
 const ids=new Set(),byId=new Map(plan.windows.map(w=>[w.id,w])),childrenByParent=new Map();
 for(const w of plan.windows)if(w.parent){if(!childrenByParent.has(w.parent))childrenByParent.set(w.parent,[]);childrenByParent.get(w.parent).push(w);}
 isoDate(plan.start_date);isoDate(plan.end_date);
 for(const w of plan.windows){
  check(UUID.test(w.id||'')&&!ids.has(w.id)&&['pending','enumerated','split','needs_review'].includes(w.state)
   &&['Pendente','Importado'].includes(w.status)&&w.start>=plan.start_date&&w.end<=plan.end_date&&w.start<=w.end,'NSDOCS_COMPLEMENTO_JANELA_INVALIDA');ids.add(w.id);
  isoDate(w.start);isoDate(w.end);
  check(Date.parse(w.end)-Date.parse(w.start)<=30*86400000,'NSDOCS_COMPLEMENTO_JANELA_INVALIDA');
  if(w.state==='enumerated'){
   check(Array.isArray(w.documents)&&Array.isArray(w.unsupported)&&Number.isInteger(w.raw_count)&&w.raw_count>=0&&w.raw_count<100&&w.next_offset===null
    &&w.raw_count===w.documents.length+w.unsupported.length+Number(w.duplicates||0),'NSDOCS_COMPLEMENTO_ENUMERACAO_INVALIDA');
   for(const d of w.documents)check(/^\d{44}$/.test(d.access_key)&&d.company_cnpj===company.cnpj&&d.model==='nfe'
    &&Number.isSafeInteger(d.total_cents)&&d.total_cents>=0&&d[plan.date_field==='data_emissao'?'issued_on':'received_on']>=w.start
    &&d[plan.date_field==='data_emissao'?'issued_on':'received_on']<=w.end,'NSDOCS_COMPLEMENTO_DOCUMENTO_INVALIDO');
  }
 }
 const nextDay=s=>new Date(Date.parse(s)+86400000).toISOString().slice(0,10);
 for(const status of ['Pendente','Importado']){
  const roots=plan.windows.filter(w=>!w.parent&&w.status===status).sort((a,b)=>a.start.localeCompare(b.start));
  check(roots.length>0&&roots[0].start===plan.start_date&&roots.at(-1).end===plan.end_date
   &&roots.every((w,i)=>i===0||w.start===nextDay(roots[i-1].end)),'NSDOCS_COMPLEMENTO_COBERTURA_INVALIDA');
 }
 for(const w of plan.windows){
  const children=(childrenByParent.get(w.id)||[]).sort((a,b)=>a.start.localeCompare(b.start));
  if(w.parent)check(byId.get(w.parent)?.state==='split','NSDOCS_COMPLEMENTO_COBERTURA_INVALIDA');
  if(w.state==='split')check(children.length===2&&children.every(c=>c.status===w.status)&&children[0].start===w.start
   &&children[1].end===w.end&&children[1].start===nextDay(children[0].end),'NSDOCS_COMPLEMENTO_COBERTURA_INVALIDA');
  else check(children.length===0,'NSDOCS_COMPLEMENTO_COBERTURA_INVALIDA');
 }
 if(plan.manifest_hash){
  check(plan.manifest_hash===digest(plan)&&canonical(plan.documents)===canonical(manifest(plan)),'NSDOCS_COMPLEMENTO_MANIFESTO_ALTERADO');
  check(plan.windows.every(w=>['enumerated','split'].includes(w.state))&&plan.batches.length===Math.ceil(plan.documents.length/5),'NSDOCS_COMPLEMENTO_LOTES_INVALIDOS');
  plan.batches.forEach((b,i)=>{check(UUID.test(b.id||'')&&!ids.has(b.id)&&b.start===i*5&&b.count===Math.min(5,plan.documents.length-i*5)&&['pending','completed'].includes(b.state),'NSDOCS_COMPLEMENTO_LOTE_INVALIDO');ids.add(b.id);});
 }
 return plan;
}
function summary(plan){
 const pending=plan.windows.filter(w=>w.state==='pending').length,review=plan.windows.some(w=>w.state==='needs_review');
 const docs=plan.manifest_hash?plan.documents:manifest(plan),keys=new Set(docs.map(d=>d.access_key));
 const missing=plan.source_keys.filter(k=>!keys.has(k)).length;
 const completed=plan.batches.filter(b=>b.state==='completed');
 return {outcome:'NSDOCS_COMPLEMENTO_ESTADO',plan_id:plan.id,source_plan_id:plan.source_id,company_id:plan.company_id,
  pending_windows:pending,enumerated_windows:plan.windows.filter(w=>w.state==='enumerated').length,needs_review:review,
  enumeration_complete:Boolean(plan.manifest_hash),documents_discovered:docs.length,source_documents:plan.source_keys.length,source_documents_missing:missing,
  unsupported_documents:plan.windows.filter(w=>w.state==='enumerated').reduce((n,w)=>n+w.unsupported.length,0),
  completed_batches:completed.length,pending_batches:plan.batches.length-completed.length,
  xml_downloads:completed.reduce((n,b)=>n+Number(b.result?.xml_downloads||0),0),reused_xmls:completed.reduce((n,b)=>n+Number(b.result?.reused_xmls||0),0),
  complete:Boolean(plan.manifest_hash)&&!review&&!missing&&completed.length===plan.batches.length,application_connector_enabled:false};
}
module.exports={create,split,manifest,freeze,validate,summary,hash,digest,identity,MAX_WINDOWS};
