'use strict';
// Uma consulta GET da LISTA, somente sob confirmacao explicita do operador.
// Sem XML, persistencia RDS/S3 ou alteracao do plano. Journal privado registra
// inicio/conclusao para respeitar cooldown; nao guarda corpo/headers/chave.
const path=require('node:path'),fs=require('node:fs'),https=require('node:https');
const {randomUUID}=require('node:crypto'),{TextDecoder}=require('node:util');
const {gunzipSync,inflateSync}=require('node:zlib');
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const LIMIT=1024*1024,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const check=(ok,code)=>{if(!ok){const e=Error(code);e.code=code;throw e;}};
function metadata(body,headers,status){
 const value=headers['content-encoding'];
 const encoding=value==null||value===''?'absent':typeof value==='string'&&['gzip','deflate','identity'].includes(value.trim().toLowerCase())?value.trim().toLowerCase():'other';
 const gzip=body[0]===0x1f&&body[1]===0x8b;
 let format='unknown',count=null,decodeError=null;
 try{
  const algorithm=encoding==='absent'?(gzip?'gzip':'identity'):encoding;
  let decoded;if(algorithm==='gzip')decoded=gunzipSync(body,{maxOutputLength:LIMIT});
  else if(algorithm==='deflate')decoded=inflateSync(body,{maxOutputLength:LIMIT});
  else if(algorithm==='identity')decoded=body;else throw Error();
  const text=new TextDecoder('utf-8',{fatal:true}).decode(decoded).trim();
  const json=JSON.parse(text);format=Array.isArray(json)?'json_array':json===null?'json_null':'json_'+typeof json;count=Array.isArray(json)?json.length:null;
 }catch{decodeError='not_a_decodable_json_array';}
 return {http_status:Number.isInteger(status)?status:null,
  content_type:/^application\/json(?:\s*;|$)/i.test(String(headers['content-type']||''))?'application/json':'other',
  content_encoding:encoding,body_bytes:body.length,gzip_signature:gzip,body_format:format,
  json_array_length:count,decode_error:decodeError,
  total_records:/^\d{1,10}$/.test(String(headers['x-total-registros']||''))?Number(headers['x-total-registros']):null};
}
function request(request,key,client=https){
 const url=new URL(request.url);
 check(url.origin==='https://api.nsdocs.com.br'&&url.pathname==='/v2/documentos'&&!url.username&&!url.password&&!url.hash,
  'NSDOCS_SONDA_DESTINO_NEGADO');
 return new Promise((resolve,reject)=>{
  let req,done=false;const timer=setTimeout(()=>finish('NSDOCS_SONDA_TIMEOUT'),15000);
  function finish(code,result){if(done)return;done=true;clearTimeout(timer);
   if(code){const e=Error(code);e.code=code;reject(e);req?.destroy();}else resolve(result);}
  try{req=client.request(url,{method:'GET',agent:false,rejectUnauthorized:true,servername:'api.nsdocs.com.br',headers:{
   Accept:'application/json; charset=utf-8','Accept-Encoding':'gzip, deflate','Empresa-Cnpj':request.companyCnpj,Authorization:'Bearer '+key
  }},res=>{
   if(res.statusCode!==200){res.destroy();return finish('NSDOCS_SONDA_HTTP_NAO_200');}
   const chunks=[];let size=0;
   res.on('error',()=>finish('NSDOCS_SONDA_REDE_FALHOU'));res.on('aborted',()=>finish('NSDOCS_SONDA_INTERROMPIDA'));
   res.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){res.destroy();finish('NSDOCS_SONDA_LIMITE');}else chunks.push(Buffer.from(chunk));});
   res.on('end',()=>{if(done)return;finish(null,metadata(Buffer.concat(chunks),res.headers,res.statusCode));});
  });req.on('error',()=>finish('NSDOCS_SONDA_REDE_FALHOU'));req.end();}
  catch{finish('NSDOCS_SONDA_REDE_FALHOU');}
 });
}
async function main(args,d={}){
 check(args.length===3&&args[0]==='--plano-id'&&UUID.test(args[1])&&args[2]==='--confirmar-consulta-real','NSDOCS_SONDA_CONFIRMACAO_OBRIGATORIA');
 const mod=name=>require(path.join(BACKEND,'src/modules/fiscal/services/nsdocsHistorical/manual',name));
 const runtime=d.runtime||mod('runtime'),company=await runtime.loadProdCompany(1,'27123008000100');
 const plan=(d.validatePlan||mod('historical').validatePlan)((d.load||mod('planStore').load)(args[1]),company);
 const pending=plan.jobs.find(j=>j.state==='pending');check(pending,'NSDOCS_SONDA_SEM_LOTE_PENDENTE');
 check(!(d.exists||fs.existsSync)('/home/ubuntu/.config/fluxy-nsdocs-prod/historical-plan.lock'),'NSDOCS_SONDA_PLANO_EM_USO');
 const policy=d.policy||mod('policy'),secrets=d.store||mod('privateStore');
 const descriptor=policy.validateQuery({companyCnpj:company.cnpj,startDate:pending.start,endDate:pending.end,
  dateField:plan.date_field,status:pending.status,limit:5,offset:pending.offset},{companyCnpj:company.cnpj});
 return secrets.withLock(async()=>{
  secrets.checkCooldown(Date.now());const id=randomUUID();let key=null,started=false;
  const journal=outcome=>secrets.appendHistory({at:Date.now(),requestId:id,companyId:company.id,outcome});
  try{
   const c=secrets.loadCredentials();policy.verifyCompany(company,c.companyId,c.companyCnpj);key=c.apiKey;c.apiKey='';
   journal('NSDOCS_SONDA_CODIFICACAO_INICIADA');started=true;
   const result=await(d.request||request)(descriptor,key);
   journal('NSDOCS_SONDA_CODIFICACAO_CONCLUIDA');started=false;
   const out={outcome:'NSDOCS_SONDA_CODIFICACAO_PROD',plan_id:plan.id,capture_id:pending.id,
    start:pending.start,end:pending.end,status:pending.status,offset:pending.offset,...result,
    external_nsdocs_calls:1,xml_downloads:0,database_writes:0,storage_calls:0,plan_changed:false};
   policy.assertNoSecret(out,key);(d.log||console.log)(JSON.stringify(out));return out;
  }finally{key='';if(started)journal('NSDOCS_SONDA_CODIFICACAO_INTERROMPIDA');}
 });
}
module.exports={metadata,request,main};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(()=>{
 console.error('NSDOCS_SONDA_CODIFICACAO_INTERROMPIDA_SEM_SEGREDOS');process.exitCode=1;
});
