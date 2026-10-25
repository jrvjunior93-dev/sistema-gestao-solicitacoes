'use strict';
const {parseArgs}=require('node:util'),{randomUUID}=require('node:crypto');
const root='../src/modules/fiscal/services/nsdocsHistorical/manual/';
const {check,companyCnpj,errorCode}=require(root+'policy'),{UUID}=require(root+'capture');
const {loadProdCompany,withProdReadDatabase,confirmWrite}=require(root+'runtime');
const core=require(root+'complement/plan'),{validatePlan}=require(root+'historical');
function parse(args){
 let v;try{v=parseArgs({args,strict:true,allowPositionals:false,options:{
  preparar:{type:'boolean'},consultar:{type:'boolean'},descobrir:{type:'boolean'},capturar:{type:'boolean'},
  'empresa-id':{type:'string'},cnpj:{type:'string'},'origem-id':{type:'string'},'plano-id':{type:'string'},
  'max-consultas':{type:'string'},'max-lotes':{type:'string'},'confirmar-chamada-real':{type:'boolean'},
  'confirmar-persistencia':{type:'boolean'},'confirmar-status-xml':{type:'boolean'}
 }}).values;}catch{check(false,'NSDOCS_ARGUMENTOS_INVALIDOS');}
 const actions=['preparar','consultar','descobrir','capturar'],action=actions.find(k=>v[k]);
 check(actions.filter(k=>v[k]).length===1&&/^\d{1,9}$/.test(v['empresa-id']||'')&&Number(v['empresa-id'])>0,'NSDOCS_ARGUMENTOS_INVALIDOS');
 const allowed=[action,'empresa-id','cnpj','plano-id'];
 check(UUID.test(v['plano-id']||''),'NSDOCS_COMPLEMENTO_ID_INVALIDO');
 if(action==='preparar'){allowed.push('origem-id');check(UUID.test(v['origem-id']||'')&&v['origem-id']!==v['plano-id'],'NSDOCS_COMPLEMENTO_ORIGEM_INVALIDA');}
 if(action==='descobrir')allowed.push('max-consultas','confirmar-chamada-real');
 if(action==='capturar')allowed.push('max-lotes','confirmar-chamada-real','confirmar-persistencia','confirmar-status-xml');
 check(Object.keys(v).every(k=>allowed.includes(k)),'NSDOCS_ARGUMENTOS_INVALIDOS');
 if(['descobrir','capturar'].includes(action))check(v['confirmar-chamada-real'],'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
 if(action==='capturar')check(v['confirmar-persistencia']&&v['confirmar-status-xml'],'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
 const count=v[action==='descobrir'?'max-consultas':'max-lotes']||'1';
 check(/^(?:[1-9]|10)$/.test(count),'NSDOCS_PLANO_LIMITE_LOTES');
 return {action,companyId:Number(v['empresa-id']),cnpj:companyCnpj(v.cnpj),planId:v['plano-id'],sourceId:v['origem-id'],count:Number(count)};
}
async function main(args,d={}){
 const o=parse(args),log=d.log||(value=>console.log(JSON.stringify(value)));
 const company=await(d.loadCompany||loadProdCompany)(o.companyId,o.cnpj);
 const store=d.store||require(root+'complement/store'),locks=d.locks||require(root+'planStore');
 if(o.action==='consultar'){log({...core.summary(core.validate(store.load(o.planId),company)),external_nsdocs_calls:0});return;}
 (d.confirmWrite||confirmWrite)('capture');
 if(o.action==='preparar'){
  await locks.withPlanLock(async()=>{
   const parent=validatePlan((d.parentStore||locks).load(o.sourceId),company);
   const sourceKeys=await(d.readDatabase||withProdReadDatabase)(async db=>{
    const repo=(d.repository||require(root+'repository').createRepository)(db);await repo.preflight(company);
    return repo.sourceKeys(parent.jobs.map(j=>j.id),company);
   });
   const plan=core.create(parent,sourceKeys,d.uuid||randomUUID);plan.id=o.planId;
   core.validate(plan,company);store.save(plan,true);log({...core.summary(plan),external_nsdocs_calls:0});
  });return;
 }
 const controller=new AbortController(),cancel=()=>controller.abort();
 if(!d.signal){process.once('SIGINT',cancel);process.once('SIGTERM',cancel);}
 try{
  const options={planId:o.planId,company,signal:d.signal||controller.signal};
  const deps={...d,store,locks,log};
  const result=o.action==='descobrir'?await(d.discover||require(root+'complement/discovery').discover)({...options,maxQueries:o.count},deps)
   :await(d.capture||require(root+'complement/capture').capture)({...options,maxBatches:o.count},deps);
  log(result);
 }finally{if(!d.signal){process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}}
}
module.exports={parse,main};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{
 console.error(errorCode(error));console.error('Interrompido. Preserve os planos e IDs; nao envie chave/XML nem remova locks.');process.exitCode=1;
});
