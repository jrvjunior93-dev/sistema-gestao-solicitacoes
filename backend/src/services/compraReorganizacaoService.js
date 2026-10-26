'use strict';
const crypto=require('node:crypto'),D=require('./compraReorganizacaoDomain');
const q=v=>Math.round(Number(v||0)*1000);
function preflight(config,snapshot){
 const b=snapshot.business,g=snapshot.guard,sc=b.SolicitacaoCompra[0];
 D.check(sc&&sc.origem!=='COMPRA_DIRETA','REORG_SC_FORA_ESCOPO');
 D.check(!['CANCELADA','CANCELADO','INATIVA','ENCERRADO'].includes(sc.status),'REORG_SC_JA_FINALIZADA');
 D.check(['LIBERADO_PARA_COMPRA','LIBERADO','COTACAO','COTACAO_ENVIADA','EM_COTACAO','FECHAMENTO_PARCIAL','FINALIZADA'].includes(sc.status),'REORG_ETAPA_EXIGE_REVISAO');
 D.check(!g.OutrasSC.length,'REORG_PRINCIPAL_COMPARTILHADA');
 if(config.tipo==='TOTAL'){
  D.check(!b.PedidoCompra.length,'REORG_TOTAL_COM_PEDIDOS');D.check(!g.TituloFinanceiro.some(t=>!t.deleted_at),'REORG_TOTAL_COM_TITULOS');
  if(config.cancelar_principal)D.check(b.Solicitacao.length===1,'REORG_PRINCIPAL_AUSENTE');
 }else{
  D.check(b.Solicitacao.length===1,'REORG_PRINCIPAL_AUSENTE');
  for(const id of config.itens_saldo){
   const item=b.PedidoCompraItem.find(i=>i.id===id&&!i.removido),received=g.PedidoCompraItemRecebimento.filter(r=>r.pedido_compra_item_id===id).reduce((s,r)=>s+q(r.quantidade),0);
   D.check(item&&q(item.quantidade_pedido)-q(item.quantidade_cancelada)-received>0,'REORG_ITEM_SEM_SALDO');
   const pid=item.pedido_compra_id,allocations=b.SolicitacaoCompraAlocacao.filter(a=>a.pedido_compra_item_id===id&&a.status==='ATIVA');
   D.check(!allocations.length||allocations.reduce((s,a)=>s+q(a.quantidade_alocada),0)>=q(item.quantidade_pedido)-q(item.quantidade_cancelada)-received,'REORG_ALOCACOES_INSUFICIENTES');
   D.check(!b.SolicitacaoCompraAlocacao.some(a=>a.pedido_compra_id===pid&&a.status!=='CANCELADA'&&a.titulo_financeiro_id)
    &&!b.PedidoCompraFrete.some(f=>f.pedido_compra_id===pid&&f.status_financeiro!=='CANCELADO'&&(f.titulo_financeiro_id||f.status_financeiro==='TITULO_GERADO'))
    &&!g.PedidoCompraTitulo.some(v=>v.pedido_compra_id===pid&&g.TituloFinanceiro.some(t=>t.id===v.titulo_financeiro_id&&!t.deleted_at&&!['CANCELADO','ESTORNADO'].includes(t.status))),'REORG_PEDIDO_COM_FINANCEIRO');
  }
  if(config.encerrar_saldo){
   D.check(b.SolicitacaoCompraFornecedor.some(f=>!['CANCELADA','CANCELADO','FINALIZADA'].includes(f.status)),'REORG_SEM_COTACAO_ATIVA');
   const sources=[...g.SolicitacaoCompraItem.map(i=>({...i,tipo:'CADASTRADO'})),...g.SolicitacaoCompraItemManual.map(i=>({...i,tipo:'MANUAL'}))];
   const hasSaldo=sources.some(i=>q(i.quantidade)>b.SolicitacaoCompraAlocacao.filter(a=>a.status==='ATIVA'&&(i.tipo==='CADASTRADO'?a.solicitacao_compra_item_id===i.id:a.solicitacao_compra_item_manual_id===i.id)).reduce((s,a)=>s+q(a.quantidade_alocada),0));
   D.check(hasSaldo||config.itens_saldo.length,'REORG_SEM_SALDO_A_ENCERRAR');
  }
 }
 return{sc_id:sc.id,solicitacao_id:sc.solicitacao_principal_id,status_anterior:sc.status,status_proposto:config.tipo==='TOTAL'?'CANCELADA':config.encerrar_saldo?'ENCERRADO':sc.status,
  principal_proposta:config.cancelar_principal?'CANCELADA':'PRESERVAR',pedidos:b.PedidoCompra.map(p=>p.id),itens_saldo:config.itens_saldo,motivo:config.motivo,
  historico_mensagem:`Lote de reorganização aplicado: SC-${String(sc.id).padStart(5,'0')}. Motivo: ${config.motivo}`};
}
function reverseReady(row,current,now=new Date()){
 D.check(row.status==='APLICADA','REORG_ESTADO_NAO_REVERSIVEL');
 D.check(D.hash(current)===D.hash(row.depois_json),'REORG_MOVIMENTACAO_POSTERIOR');
 for(const ch of row.alteracoes_json)if(ch.model==='ObrigacaoOperacional'&&!ch.created&&ch.fields.status?.antes==='PENDENTE'){
  const old=row.antes_json.business.ObrigacaoOperacional.find(o=>o.id===ch.id);
  D.check(old&&new Date(old.limite_em).getTime()>=now.getTime(),'REORG_PRAZO_VENCIDO_EXIGE_REVISAO');
 }
}
function createService(store,authorize){
 D.check(typeof authorize==='function','REORG_AUTORIZADOR_OBRIGATORIO',500);
 const actor=user=>{D.check(Number.isSafeInteger(user?.id)&&user.id>0,'REORG_SESSAO_OBRIGATORIA',401);return user.id;};
 function sign(type,userId,sc,other={}){const p={versao:1,tipo:type,usuario_id:userId,...other,sc};return{...p,hash:D.planHash(p)};}
 async function simulate(user,input){
  const userId=actor(user),configs=D.entries(input),result=[];
  for(const config of configs)await store.transaction(async tx=>{
   const before=await store.capture(config.sc_id,tx);await authorize(user,config,'APLICAR',before,tx);
   try{const preview=preflight(config,before);result.push({sc_id:config.sc_id,entrada:config,antes_hash:D.hash(before),situacao:'PRONTA',previa:preview});}
   catch(e){result.push({sc_id:config.sc_id,entrada:config,antes_hash:D.hash(before),situacao:'BLOQUEADA',codigo:D.safeError(e)});}
  });
  return sign('APLICAR',userId,result);
 }
 async function apply(user,{lote_id,plano,sc_ids,confirmacao}){
  const userId=actor(user),lote=D.uuid(lote_id);D.check(confirmacao==='APLICAR_LOTE_REVISADO','REORG_CONFIRMACAO_OBRIGATORIA',400);D.validatePlan(plano,'APLICAR',userId);
  const selected=D.ids(sc_ids,10),out=[];
  for(const id of selected){const planned=plano.sc.find(s=>s.sc_id===id);D.check(planned,'REORG_SC_FORA_PLANO',400);
   try{out.push(await store.transaction(async tx=>{
    const before=await store.capture(id,tx,true),config=D.entries([planned.entrada])[0];await authorize(user,config,'APLICAR',before,tx);
    const existing=await store.journal({lote_id:lote,solicitacao_compra_id:id},tx,true);
    if(existing){D.check(existing.plano_hash===plano.hash&&existing.status==='APLICADA','REORG_LOTE_JA_USADO');return{sc_id:id,status:'APLICADA',replay:true};}
    D.check(planned.situacao==='PRONTA'&&planned.antes_hash===D.hash(before),'REORG_PLANO_DESATUALIZADO');preflight(config,before);
    return store.writeGuard(tx,async()=>{
     const entry=await store.createJournal({id:crypto.randomUUID(),lote_id:lote,solicitacao_compra_id:id,usuario_id:userId,plano_hash:plano.hash,status:'EM_EXECUCAO',entrada_json:config,antes_json:before,depois_json:before,alteracoes_json:[]},tx);
     await store.run(config,userId,entry.id,before,tx);
     const after=await store.capture(id,tx,true);D.check(D.hash(after.guard)===D.hash(before.guard),'REORG_REGISTRO_PROTEGIDO_ALTERADO');
     const changes=D.delta(before.business,after.business,store.specs);D.check(changes.length>0,'REORG_SEM_ALTERACAO');
     await entry.update({status:'APLICADA',depois_json:after,alteracoes_json:changes},{transaction:tx});
     await store.audit(entry,userId,'APLICADO',config.motivo,tx);return{sc_id:id,status:'APLICADA',operacao_id:entry.id,replay:false};
    });
   }));}catch(e){if(e.statusCode===403||e.statusCode===401)throw e;out.push({sc_id:id,status:'CONFLITO',codigo:D.safeError(e)});}
  }
  return{lote_id:lote,resultados:out};
 }
 async function selectedRows(lote,selection){
  const records=await store.listJournal({lote_id:D.uuid(lote)});D.check(records.length&&records.length<=100,'REORG_LOTE_NAO_ENCONTRADO',404);
  let selected;
  if(selection.todas===true){D.check(selection.sc_ids===undefined,'REORG_SELECAO_INVALIDA',400);selected=records.map(r=>r.solicitacao_compra_id);}
  else {D.check(selection.todas===undefined||selection.todas===false,'REORG_SELECAO_INVALIDA',400);selected=D.ids(selection.sc_ids);}
  D.check(selected.every(id=>records.some(r=>r.solicitacao_compra_id===id)),'REORG_SC_FORA_LOTE',400);
  return records.filter(r=>selected.includes(r.solicitacao_compra_id)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||b.solicitacao_compra_id-a.solicitacao_compra_id);
 }
 async function simulateReverse(user,{lote_id,sc_ids,todas,motivo}){
  const why=D.reason(motivo);
  const userId=actor(user),records=await selectedRows(lote_id,{sc_ids,todas}),result=[];
  for(const row of records)await store.transaction(async tx=>{
   const current=await store.capture(row.solicitacao_compra_id,tx);await authorize(user,row.entrada_json,'REVERTER',current,tx);
   const item={sc_id:row.solicitacao_compra_id,operacao_id:row.id,atual_hash:D.hash(current),depois_hash:D.hash(row.depois_json)};
   if(row.status==='REVERTIDA')result.push({...item,situacao:'JA_REVERTIDA'});
   else try{reverseReady(row,current);result.push({...item,situacao:'PRONTA'});}catch(e){result.push({...item,situacao:'BLOQUEADA',codigo:D.safeError(e)});}
  });
  return sign('REVERTER',userId,result,{lote_id,motivo:why});
 }
 async function reverse(user,{plano,motivo,confirmacao,sc_ids}){
  const userId=actor(user);D.check(confirmacao==='REVERTER_LOTE_REVISADO','REORG_CONFIRMACAO_OBRIGATORIA',400);D.validatePlan(plano,'REVERTER',userId);D.uuid(plano.lote_id);const why=D.reason(motivo),selected=D.ids(sc_ids,10),out=[];D.check(why===plano.motivo,'REORG_MOTIVO_DIVERGENTE',400);
  for(const id of selected){const p=plano.sc.find(s=>s.sc_id===id);D.check(p,'REORG_SC_FORA_PLANO',400);
   try{out.push(await store.transaction(async tx=>{
    const current=await store.capture(id,tx,true),row=await store.journal({lote_id:plano.lote_id,solicitacao_compra_id:id},tx,true);D.check(row&&row.id===p.operacao_id,'REORG_OPERACAO_DIVERGENTE');await authorize(user,row.entrada_json,'REVERTER',current,tx);
    if(row.status==='REVERTIDA')return{sc_id:id,status:'REVERTIDA',replay:true};
    D.check(p.situacao==='PRONTA'&&p.atual_hash===D.hash(current)&&p.depois_hash===D.hash(row.depois_json),'REORG_PLANO_DESATUALIZADO');reverseReady(row,current);
    return store.writeGuard(tx,async()=>{
     await store.restore(row,tx);const restored=await store.capture(id,tx,true);D.check(D.hash(restored.guard)===D.hash(row.antes_json.guard),'REORG_REGISTRO_PROTEGIDO_ALTERADO');
     for(const change of row.alteracoes_json){const spec=store.specs[change.model],r=restored.business[change.model].find(r=>r[spec.pk||'id']===change.id);D.check(r,'REORG_RESTAURACAO_INCOMPLETA');
      if(!change.created){for(const [k,v] of Object.entries(change.fields))if(!(change.model==='PedidoCompraEntrega'&&k==='versao'))D.check(D.canonical(r[k])===D.canonical(v.antes),'REORG_RESTAURACAO_INCOMPLETA');}
      else if(spec.created==='ANULAR')D.check(r.status==='REVERTIDO','REORG_RESTAURACAO_INCOMPLETA');
      else if(spec.created==='ZERAR')D.check(Number(r.valor_item_base)===0&&Number(r.valor_rateado)===0&&Number(r.percentual_rateio)===0,'REORG_RESTAURACAO_INCOMPLETA');
      else if(spec.created==='CONTROLE')D.check(r.estado==='OBRA'&&r.previsao===null&&r.prazo_compras===null&&Number(r.saldo_cancelado)===0&&r.versao>change.row.versao,'REORG_RESTAURACAO_INCOMPLETA');
     }
     await row.update({status:'REVERTIDA',revertido_por:userId,revertido_em:new Date(),motivo_reversao:why},{transaction:tx});await store.audit(row,userId,'REVERTIDO',why,tx);
     return{sc_id:id,status:'REVERTIDA',replay:false};
    });
   }));}catch(e){if(e.statusCode===403||e.statusCode===401)throw e;out.push({sc_id:id,status:'CONFLITO',codigo:D.safeError(e)});}
  }
  return{lote_id:plano.lote_id,resultados:out};
 }
 async function status(user,lote_id){actor(user);const records=await selectedRows(lote_id,{todas:true}),out=[];for(const r of records){await store.transaction(async tx=>{const s=await store.capture(r.solicitacao_compra_id,tx);await authorize(user,r.entrada_json,'CONSULTAR',s,tx);});out.push({sc_id:r.solicitacao_compra_id,status:r.status,operacao_id:r.id,plano_hash:r.plano_hash,criado_em:r.createdAt,revertido_em:r.revertido_em});}return{lote_id,resultados:out};}
 return{simulate,apply,simulateReverse,reverse,status};
}
module.exports={createService,preflight,reverseReady};
