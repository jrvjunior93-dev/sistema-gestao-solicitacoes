'use strict';
const fs=require('node:fs'),{randomUUID,createHash}=require('node:crypto');
const {PRIVATE_DIR,check}=require('../policy'),privateStore=require('../privateStore'),{UUID}=require('../capture');
const MAX_BYTES=8*1024*1024;
const file=id=>{check(UUID.test(id||''),'NSDOCS_COMPLEMENTO_ID_INVALIDO');return `${PRIVATE_DIR}/complement-${id}.json`;};
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){
 const fd=privateStore.openPrivate(name,fs.constants.O_RDONLY);
 try{check(fs.fstatSync(fd).size<=MAX_BYTES,'NSDOCS_COMPLEMENTO_LIMITE_ARQUIVO');return JSON.parse(fs.readFileSync(fd,'utf8'));}
 finally{fs.closeSync(fd);}
}
const serialize=value=>JSON.stringify(value)+'\n';
const frozen=plan=>({...plan,batches:plan.batches.map(b=>({id:b.id,start:b.start,count:b.count,state:'pending',result:null}))});
function pointer(p,id){
 check(p.id===id&&UUID.test(p.manifest_id||'')&&/^[0-9a-f]{64}$/.test(p.manifest_sha256||'')&&/^[0-9a-f]{64}$/.test(p.manifest_hash||'')
  &&Array.isArray(p.completed),'NSDOCS_COMPLEMENTO_CHECKPOINT_INVALIDO');
 return `${PRIVATE_DIR}/complement-${id}-${p.manifest_id}.manifest.json`;
}
function load(id){
 const p=read(file(id));check(p.id===id,'NSDOCS_COMPLEMENTO_ID_INVALIDO');
 if(p.format!=='manifest-progress-v1')return p;
 const plan=read(pointer(p,id));
 check(checksum(serialize(plan))===p.manifest_sha256&&plan.id===id&&plan.manifest_hash===p.manifest_hash,'NSDOCS_COMPLEMENTO_MANIFESTO_ALTERADO');
 const seen=new Set();
 for(const c of p.completed){
  check(Number.isInteger(c.index)&&c.index>=0&&c.index<plan.batches.length&&!seen.has(c.index),'NSDOCS_COMPLEMENTO_CHECKPOINT_INVALIDO');seen.add(c.index);
  const b=plan.batches[c.index];
  check(['xml_downloads','reused_xmls','resumed_documents'].every(k=>Number.isInteger(c[k])&&c[k]>=0)
   &&c.xml_downloads+c.reused_xmls+c.resumed_documents===b.count,'NSDOCS_COMPLEMENTO_CHECKPOINT_INVALIDO');
  b.state='completed';b.result={documents:b.count,xml_downloads:c.xml_downloads,reused_xmls:c.reused_xmls,resumed_documents:c.resumed_documents};
 }
 return plan;
}
function write(name,bytes){
 check(Buffer.byteLength(bytes)<=MAX_BYTES,'NSDOCS_COMPLEMENTO_LIMITE_ARQUIVO');
 const fd=privateStore.openPrivate(name,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function save(plan,create=false){
 privateStore.assertDirectory();const target=file(plan.id),previous=create?null:read(target);
 let payload=plan;
 if(plan.manifest_hash){
  // Metadados imutaveis sao escritos uma vez. Cada lote grava somente indices
  // e contagens de progresso, evitando reescrever todos os documentos/XMLs.
  const snapshot=serialize(frozen(plan)),sha=checksum(snapshot);
  let manifestId;
  if(previous?.format==='manifest-progress-v1'){
   pointer(previous,plan.id);check(previous.manifest_hash===plan.manifest_hash&&previous.manifest_sha256===sha,'NSDOCS_COMPLEMENTO_MANIFESTO_ALTERADO');manifestId=previous.manifest_id;
  }else{
   manifestId=randomUUID();write(`${PRIVATE_DIR}/complement-${plan.id}-${manifestId}.manifest.json`,snapshot);
  }
  payload={format:'manifest-progress-v1',id:plan.id,manifest_hash:plan.manifest_hash,manifest_id:manifestId,manifest_sha256:sha,
   completed:plan.batches.flatMap((b,index)=>b.state==='completed'?[{index,xml_downloads:Number(b.result?.xml_downloads||0),reused_xmls:Number(b.result?.reused_xmls||0),resumed_documents:Number(b.result?.resumed_documents||0)}]:[])};
 }
 const temporary=create?target:`${PRIVATE_DIR}/complement-${plan.id}-${randomUUID()}.tmp`;
 write(temporary,serialize(payload));
 if(!create)fs.renameSync(temporary,target);
 const dir=fs.openSync(PRIVATE_DIR,fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
module.exports={load,save,MAX_BYTES};
