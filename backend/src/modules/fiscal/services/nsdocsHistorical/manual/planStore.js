'use strict';
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PRIVATE_DIR,check}=require('./policy'),store=require('./privateStore');
const {UUID}=require('./capture');
const filename=id=>{check(UUID.test(id||''),'NSDOCS_PLANO_ID_INVALIDO');return `${PRIVATE_DIR}/historical-${id}.json`;};
function load(id){
 const fd=store.openPrivate(filename(id),fs.constants.O_RDONLY);
 try{check(fs.fstatSync(fd).size<=1024*1024,'NSDOCS_PLANO_LIMITE');return JSON.parse(fs.readFileSync(fd,'utf8'));}
 finally{fs.closeSync(fd);}
}
function save(plan,create=false){
 const file=filename(plan.id);store.ensureDirectory();
 const serialized=JSON.stringify(plan)+'\n';check(Buffer.byteLength(serialized)<=1024*1024,'NSDOCS_PLANO_LIMITE');
 if(create){const fd=store.openPrivate(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL);
  try{fs.writeFileSync(fd,serialized);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return;
 }
 // O lock do plano serializa as substituicoes. Arquivo final nunca fica parcial.
 load(plan.id);
 const tmp=`${PRIVATE_DIR}/historical-${plan.id}-${randomUUID()}.tmp`;
 const fd=store.openPrivate(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL);
 try{fs.writeFileSync(fd,serialized);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);
 const dir=fs.openSync(PRIVATE_DIR,fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
async function withPlanLock(action){
 const file=`${PRIVATE_DIR}/historical-plan.lock`;
 let fd;try{fd=store.openPrivate(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL);}
 catch{check(false,'NSDOCS_PLANO_OCUPADO');}
 try{fs.writeFileSync(fd,String(process.pid));return await action();}
 finally{fs.closeSync(fd);fs.unlinkSync(file);}
}
module.exports={load,save,withPlanLock};
