'use strict';
const crypto=require('node:crypto');
const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{statusCode});};
const check=(v,c,s)=>{if(!v)fail(c,s);};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function keys(o,allowed){check(plain(o)&&Object.keys(o).every(k=>allowed.includes(k)),'REORG_ENTRADA_INVALIDA',400);}
function ids(a,max=100){check(Array.isArray(a)&&a.length>0&&a.length<=max&&a.every(n=>Number.isSafeInteger(n)&&n>0)&&new Set(a).size===a.length,'REORG_SELECAO_INVALIDA',400);return [...a].sort((a,b)=>a-b);}
function reason(s){check(typeof s==='string'&&s.trim().length>0&&s.trim().length<=2000&&!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s),'REORG_MOTIVO_OBRIGATORIO',400);return s.trim();}
function uuid(s){check(typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s),'REORG_LOTE_INVALIDO',400);return s;}
function entries(a){
 check(Array.isArray(a)&&a.length>0&&a.length<=100,'REORG_LIMITE_SC',400);
 const result=a.map(o=>{
  keys(o,['sc_id','tipo','cancelar_principal','cancelar_cotacao','encerrar_saldo','itens_saldo','motivo']);ids([o.sc_id]);
  check(['TOTAL','PARCIAL'].includes(o.tipo)&&['cancelar_principal','cancelar_cotacao','encerrar_saldo'].every(k=>typeof o[k]==='boolean'),'REORG_ESCOPO_EXPLICITO_OBRIGATORIO',400);
  const items=o.itens_saldo?.length?ids(o.itens_saldo,500):[];check(Array.isArray(o.itens_saldo),'REORG_SELECAO_INVALIDA',400);
  if(o.tipo==='TOTAL')check(!o.encerrar_saldo&&!items.length,'REORG_TOTAL_INCOMPATIVEL',400);
  else check(!o.cancelar_principal&&!o.cancelar_cotacao&&(o.encerrar_saldo||items.length),'REORG_PARCIAL_INCOMPATIVEL',400);
  return{sc_id:o.sc_id,tipo:o.tipo,cancelar_principal:o.cancelar_principal,cancelar_cotacao:o.cancelar_cotacao,encerrar_saldo:o.encerrar_saldo,itens_saldo:items,motivo:reason(o.motivo)};
 });ids(result.map(o=>o.sc_id));return result.sort((a,b)=>a.sc_id-b.sc_id);
}
function planHash(p){const {hash:ignored,...body}=p;return hash(body);}
function validatePlan(p,kind,userId){
 check(plain(p)&&p.versao===1&&p.tipo===kind&&p.usuario_id===userId&&p.hash===planHash(p),'REORG_PLANO_INVALIDO',400);
 check(Array.isArray(p.sc)&&p.sc.length>0&&p.sc.length<=100,'REORG_PLANO_INVALIDO',400);ids(p.sc.map(s=>s.sc_id));return p;
}
const pkFor=(spec,row)=>row[spec.pk||'id'];
function delta(before,after,specs){
 const changes=[];
 for(const [name,spec] of Object.entries(specs)){
  const old=new Map((before[name]||[]).map(r=>[pkFor(spec,r),r])),next=new Map((after[name]||[]).map(r=>[pkFor(spec,r),r]));
  for(const [id,row] of old){check(next.has(id),'REORG_EXCLUSAO_PROIBIDA');const newer=next.get(id),fields={};
   for(const k of spec.write)if(canonical(row[k])!==canonical(newer[k]))fields[k]={antes:row[k],depois:newer[k]};
   if(Object.keys(fields).length)changes.push({model:name,id,fields});
  }
  for(const [id,row] of next)if(!old.has(id)){check(spec.created,'REORG_CRIACAO_FORA_ESCOPO');changes.push({model:name,id,created:true,row});}
 }
 return changes;
}
function safeError(e){return /^REORG_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'REORG_OPERACAO_INTERROMPIDA';}
module.exports={fail,check,canonical,hash,plain,keys,ids,reason,uuid,entries,planHash,validatePlan,delta,safeError};
