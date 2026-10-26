'use strict';
// Cliente manual HTTP. Nunca abre banco, carrega .env ou reinicia processos.
const fs=require('node:fs'),path=require('node:path');
const D=require('../src/services/compraReorganizacaoDomain');
const allowed=new Set(['http://127.0.0.1:8000/api','http://127.0.0.1:8001/api','https://api.jrfluxy.com.br/api','https://api-dev.jrfluxy.com.br/api']);
function argumentsOf(args){
 const flags=new Set(['--todas','--confirmar-gravacao','--confirmar-reversao']),values=new Set(['--acao','--api','--token-arquivo','--entrada','--plano','--saida','--lote','--sc','--motivo']);const out={};
 for(let i=0;i<args.length;i++){const k=args[i];D.check(!Object.hasOwn(out,k),'REORG_ARGUMENTO_DUPLICADO',400);if(flags.has(k))out[k]=true;else{D.check(values.has(k)&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'REORG_ARGUMENTOS_INVALIDOS',400);out[k]=args[++i];}}
 return out;
}
function readJson(file){const s=fs.statSync(file);D.check(s.size<=8*1024*1024,'REORG_ARQUIVO_GRANDE',400);return JSON.parse(fs.readFileSync(file,'utf8'));}
function tokenFrom(file){
 const s=fs.lstatSync(file);D.check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size>0&&s.size<=16384,'REORG_TOKEN_ARQUIVO_INVALIDO',400);
 if(process.platform==='linux')D.check(s.uid===process.getuid()&&(s.mode&0o777)===0o600,'REORG_TOKEN_EXIGE_0600',400);
 const value=fs.readFileSync(file,'utf8').trim();D.check(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value),'REORG_TOKEN_INVALIDO',400);return value;
}
function selection(a,plan){D.check(!(a['--todas']&&a['--sc']),'REORG_SELECAO_INVALIDA',400);if(a['--todas'])return plan?plan.sc.map(s=>s.sc_id):null;D.check(a['--sc']&&/^\d+(,\d+)*$/.test(a['--sc']),'REORG_SELECAO_EXPLICITA_OBRIGATORIA',400);return D.ids(a['--sc'].split(',').map(Number));}
async function main(args,{fetchImpl=globalThis.fetch}={}){
 const a=argumentsOf(args),action=a['--acao']||'simular',api=a['--api'];D.check(allowed.has(api),'REORG_API_FORA_ALLOWLIST',400);
 D.check(['simular','aplicar','consultar','simular-reversao','reverter'].includes(action),'REORG_ACAO_INVALIDA',400);
 D.check(a['--saida']&&a['--token-arquivo'],'REORG_ARQUIVOS_OBRIGATORIOS',400);
 if(action==='aplicar')D.check(a['--confirmar-gravacao']===true,'REORG_CONFIRMACAO_OBRIGATORIA',400);
 if(action==='reverter')D.check(a['--confirmar-reversao']===true,'REORG_CONFIRMACAO_OBRIGATORIA',400);
 if(['consultar','simular-reversao','aplicar'].includes(action))D.uuid(a['--lote']);
 let plan,selected,input;
 if(action==='simular'){input=readJson(a['--entrada']);D.keys(input,['itens']);D.entries(input.itens);}
 if(['aplicar','reverter'].includes(action)){const file=readJson(a['--plano']);plan=file.plano||file;D.check(plan.tipo===(action==='aplicar'?'APLICAR':'REVERTER'),'REORG_PLANO_INVALIDO',400);selected=selection(a,plan);D.check(selected.every(id=>plan.sc.some(s=>s.sc_id===id)),'REORG_SC_FORA_PLANO',400);}
 if(action==='simular-reversao'){selected=selection(a);D.reason(a['--motivo']);}
 D.check(!a['--motivo']||action==='simular-reversao','REORG_MOTIVO_SOMENTE_NA_SIMULACAO',400);
 const token=tokenFrom(a['--token-arquivo']);
 const output=fs.openSync(path.resolve(a['--saida']),fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 const result={acao:action,iniciado_em:new Date().toISOString(),resultados:[]};
 const save=value=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');fs.ftruncateSync(output,0);fs.writeSync(output,bytes,0,bytes.length,0);fs.fsyncSync(output);};
 async function call(route,body,method='POST'){
  const response=await fetchImpl(api+'/compras/reorganizacao'+route,{method,redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();D.check(response.ok&&data&&typeof data==='object'&&!Array.isArray(data),/^REORG_[A-Z0-9_]+$/.test(data?.error||'')?data.error:'REORG_HTTP_FALHOU');return data;
 }
 try{
  if(action==='simular')result.plano=await call('/simular',input);
  if(action==='consultar')Object.assign(result,await call('/lotes/'+a['--lote'],null,'GET'));
  if(action==='simular-reversao')result.plano=await call('/lotes/'+a['--lote']+'/simular-reversao',{...(selected?{sc_ids:selected}:{todas:true}),motivo:a['--motivo']});
  if(['aplicar','reverter'].includes(action)){
   const lote=action==='aplicar'?a['--lote']:D.uuid(plan.lote_id);result.lote_id=lote;
   for(let i=0;i<selected.length;i+=10){const batch=selected.slice(i,i+10),route='/lotes/'+lote+(action==='aplicar'?'/aplicar':'/reverter');
    const r=await call(route,{plano:plan,sc_ids:batch,confirmacao:action==='aplicar'?'APLICAR_LOTE_REVISADO':'REVERTER_LOTE_REVISADO',...(action==='reverter'?{motivo:plan.motivo}:{})});result.resultados.push(...r.resultados);
    // Persistencia LOCAL a cada resposta: nao altera dados do servidor.
    save(result);
   }
  }
  result.concluido_em=new Date().toISOString();save(result);
  return result;
 }catch(e){save({...result,interrompido:true,codigo:D.safeError(e)});throw e;}finally{fs.closeSync(output);}
}
module.exports={main,argumentsOf,selection,tokenFrom};
if(require.main===module)main(process.argv.slice(2)).then(r=>{const conflitos=r.resultados?.filter(s=>s.status==='CONFLITO').length||0;console.log(JSON.stringify({outcome:'REORG_CLIENTE_MANUAL_CONCLUIDO',acao:r.acao,lote_id:r.lote_id,scs:r.plano?.sc?.length,conflitos,resultados:r.resultados?.map(s=>({sc_id:s.sc_id,status:s.status,replay:s.replay,codigo:s.codigo})),alteracao_automatica:false}));if(conflitos)process.exitCode=2;}).catch(e=>{console.error(D.safeError(e));process.exitCode=1;});
