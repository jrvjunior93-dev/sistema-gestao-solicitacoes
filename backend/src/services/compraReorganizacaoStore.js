'use strict';
const D=require('./compraReorganizacaoDomain');
const fields=s=>s.split(' ');
const specs={
 SolicitacaoCompra:{scope:'sc',write:fields('status encerrado_em observacoes valor_fechado desconto_total frete_valor'),read:fields('id origem obra_id solicitacao_principal_id solicitante_id comprador_responsavel_id')},
 Solicitacao:{scope:'principal',write:fields('status_global valor'),read:fields('id obra_id codigo')},
 SolicitacaoCompraFornecedor:{scope:'sc',write:['status'],read:fields('id solicitacao_compra_id fornecedor_compra_id')},
 PedidoCompra:{scope:'pedido',write:fields('status valor_total valor_total_fornecedor valor_mercadorias valor_tributos difal_total desconto_total frete_total atingiu_pedido_minimo cancelado_por cancelado_em motivo_cancelamento encerrado_em'),read:fields('id solicitacao_compra_id obra_id fornecedor_compra_id')},
 PedidoCompraItem:{scope:'item',write:fields('quantidade_pedido quantidade_cancelada removido cancelado_por cancelado_em motivo_cancelamento ipi_valor icms_valor st_valor difal_rateado valor_total valor_mercadoria desconto_rateado frete_rateado'),read:fields('id pedido_compra_id descricao unidade preco_unitario solicitacao_compra_item_id solicitacao_compra_item_manual_id')},
 SolicitacaoCompraAlocacao:{scope:'sc',write:fields('quantidade_alocada status cancelado_por cancelado_em motivo_cancelamento desconto_rateado ipi_rateado icms_rateado st_rateado difal_rateado frete_rateado valor_total'),read:fields('id solicitacao_compra_id pedido_compra_id pedido_compra_item_id item_tipo solicitacao_compra_item_id solicitacao_compra_item_manual_id titulo_financeiro_id')},
 PedidoCompraFrete:{scope:'frete',write:fields('status_financeiro valor_total'),read:fields('id pedido_compra_id solicitacao_compra_id titulo_financeiro_id tipo criterio_rateio')},
 PedidoCompraFreteRateio:{scope:'rateio',write:fields('valor_item_base percentual_rateio valor_rateado manual'),read:fields('id frete_id pedido_compra_id pedido_compra_item_id solicitacao_compra_item_id solicitacao_compra_item_manual_id obra_id'),created:'ZERAR'},
 PedidoCompraEntrega:{scope:'entrega',pk:'pedido_compra_item_id',write:fields('versao estado prazo_compras saldo_cancelado previsao'),read:fields('pedido_compra_item_id pedido_compra_id'),created:'CONTROLE'},
 ObrigacaoOperacional:{scope:'prazo',write:fields('status encerrada_em usuario_id motivo'),read:fields('id chave tipo referencia_id pedido_id solicitacao_id obra_id inicio_em prazo_em limite_em')},
 SolicitacaoCompraFechamento:{scope:'sc',write:['status'],read:fields('id solicitacao_compra_id tipo numero_rodada idempotency_key quantidade_total quantidade_nao_comprada valor_total justificativa fechado_em criado_por'),created:'ANULAR'}
};
function createStore(db){
 const {Op,Transaction}=require('sequelize');
 const filtered=(name,attrs)=>[...new Set(attrs)].filter(k=>db[name].rawAttributes[k]);
 for(const [name,s] of Object.entries(specs))D.check(db[name]&&s.write.every(k=>db[name].rawAttributes[k]),'REORG_MODELOS_INCOMPATIVEIS');
 async function all(name,where,tx,write=false,attrs){
  const model=db[name];D.check(model,'REORG_MODELO_AUSENTE');const pk=model.primaryKeyAttribute||'id';
  const rows=await model.unscoped().findAll({where,attributes:attrs?filtered(name,attrs):undefined,transaction:tx,lock:write?tx.LOCK.UPDATE:undefined,order:[[pk,'ASC']],limit:10001});
  D.check(rows.length<=10000,'REORG_SNAPSHOT_LIMITE');return JSON.parse(JSON.stringify(rows.map(r=>r.toJSON())));
 }
 async function capture(scId,tx,write=false){
  const sc=(await all('SolicitacaoCompra',{id:scId},tx,write,fields('id status origem obra_id solicitacao_principal_id solicitante_id comprador_responsavel_id updatedAt')))[0];D.check(sc,'REORG_SC_NAO_ENCONTRADA',404);
  const ps=await all('PedidoCompra',{solicitacao_compra_id:scId},tx,write,fields('id solicitacao_compra_id'));
  const pids=ps.map(p=>p.id),inPedidos={ [Op.in]:pids },principal=sc.solicitacao_principal_id||-1;
  const wheres={sc:{solicitacao_compra_id:scId},principal:{id:principal},pedido:{solicitacao_compra_id:scId},item:{pedido_compra_id:inPedidos},frete:{[Op.or]:[{solicitacao_compra_id:scId},{pedido_compra_id:inPedidos}]},rateio:{pedido_compra_id:inPedidos},entrega:{pedido_compra_id:inPedidos},prazo:{tipo:'ENTREGA_OBRA',[Op.or]:[{solicitacao_id:principal},{pedido_id:inPedidos}]}};
  const business={};
  for(const [name,s] of Object.entries(specs))business[name]=await all(name,name==='SolicitacaoCompra'?{id:scId}:wheres[s.scope],tx,write,[...s.read,...s.write,'updatedAt','createdAt']);
  const itemIds=business.PedidoCompraItem.map(i=>i.id);
  const guard={};
  const guardRead=async(name,where,attrs)=>guard[name]=await all(name,where,tx,write,fields(attrs+' updatedAt createdAt'));
  await guardRead('SolicitacaoCompraItem',{solicitacao_compra_id:scId},'id solicitacao_compra_id quantidade status_aprovacao insumo_id unidade_id');
  await guardRead('SolicitacaoCompraItemManual',{solicitacao_compra_id:scId},'id solicitacao_compra_id quantidade status_aprovacao nome_manual unidade_sigla_manual');
  await guardRead('PedidoCompraItemRecebimento',{pedido_compra_item_id:{[Op.in]:itemIds}},'id pedido_compra_item_id quantidade recebido_em usuario_id');
  await guardRead('PedidoCompraTitulo',{pedido_compra_id:inPedidos},'id pedido_compra_id titulo_financeiro_id valor status_liberacao');
  await guardRead('TituloCompartilhadoOrigem',{[Op.or]:[{solicitacao_id:principal},{pedido_compra_id:inPedidos}]},'id titulo_financeiro_id solicitacao_id pedido_compra_id valor');
  const tids=[...new Set([...business.SolicitacaoCompraAlocacao,...business.PedidoCompraFrete,...guard.PedidoCompraTitulo,...guard.TituloCompartilhadoOrigem].map(r=>r.titulo_financeiro_id).filter(Boolean))];
  await guardRead('TituloFinanceiro',{[Op.or]:[{solicitacao_id:principal},{id:{[Op.in]:tids}}]},'id codigo solicitacao_id status valor_original valor_baixado valor_saldo deleted_at');
  const financeIds=guard.TituloFinanceiro.map(t=>t.id);
  await guardRead('PagamentoManualFilaItem',{titulo_financeiro_id:{[Op.in]:financeIds}},'id titulo_financeiro_id status valor valor_pago');
  await guardRead('PagamentoAutorizacaoItem',{titulo_financeiro_id:{[Op.in]:financeIds}},'id titulo_financeiro_id status lote_id valor_snapshot');
  await guardRead('FiscalDocumentLink',{[Op.or]:[{solicitacao_id:principal},{solicitacao_compra_id:scId},{pedido_id:inPedidos}]},'id fiscal_dfe_document_id pedido_id pedido_item_id financeiro_titulo_id link_status confirmed_at allocated_value');
  await guardRead('PedidoCompraDocumentoFinanceiro',{pedido_compra_id:inPedidos},'id pedido_compra_id tipo');
  await guardRead('PedidoCompraReabertura',{pedido_compra_id:inPedidos},'id pedido_compra_id status');
  await guardRead('Anexo',{solicitacao_id:principal},'id solicitacao_id');
  await guardRead('OutrasSC',{solicitacao_principal_id:principal,id:{[Op.ne]:scId}},'id');
  // OutrasSC e alias do mesmo model, sem outra tabela nem campos privados.
  D.check(Buffer.byteLength(JSON.stringify({business,guard}))<=3*1024*1024,'REORG_SNAPSHOT_LIMITE');
  return{business,guard};
 }
 // Alias local para reutilizar a mesma consulta/serializacao, sem registrar model novo.
 db={...db,OutrasSC:db.SolicitacaoCompra};
 function writeGuard(tx,action){
  const tableSpecs=new Map(Object.entries(specs).map(([n,s])=>[db[n].getTableName(),s]));
  const auditTables=new Set(['CompraReorganizacaoOperacao','Historico','SolicitacaoCompraLog','PedidoCompraItemLog','PedidoCompraEntregaOperacao'].map(n=>db[n].getTableName()));
  // Conexao exclusiva desta transacao; nao altera query global nem outras sessoes.
  const connection=tx.connection;D.check(connection&&typeof connection.query==='function','REORG_CONEXAO_TRANSACAO_AUSENTE');const saved={};
  for(const method of ['query','execute'])if(typeof connection[method]==='function'){
   saved[method]=connection[method];connection[method]=function(...args){guardSql(typeof args[0]==='string'?args[0]:args[0]?.sql||'',tableSpecs,auditTables);return saved[method].apply(this,args);};
  }
  return Promise.resolve().then(action).finally(()=>{for(const method of Object.keys(saved))connection[method]=saved[method];});
 }
 async function journal(where,tx,lock=false){return db.CompraReorganizacaoOperacao.findOne({where,transaction:tx,lock:lock?tx.LOCK.UPDATE:undefined});}
 async function audit(entry,userId,action,motivo,tx){
  const meta={lote_id:entry.lote_id,operacao_id:entry.id,solicitacao_compra_id:entry.solicitacao_compra_id,tipo:entry.entrada_json.tipo,
   cancelar_principal:entry.entrada_json.cancelar_principal,cancelar_cotacao:entry.entrada_json.cancelar_cotacao,encerrar_saldo:entry.entrada_json.encerrar_saldo,itens_saldo:entry.entrada_json.itens_saldo,
   registros_alterados:entry.alteracoes_json.map(c=>({model:c.model,id:c.id,criado:!!c.created,campos:c.created?[]:Object.keys(c.fields)}))};
  const sc=entry.antes_json.business.SolicitacaoCompra[0],description=`${action==='APLICADO'?'Lote de reorganização aplicado':'Reversão do lote de reorganização'}: SC-${String(sc.id).padStart(5,'0')}. Motivo: ${motivo}`;
  await db.SolicitacaoCompraLog.create({solicitacao_compra_id:sc.id,usuario_id:userId,tipo_acao:'REORGANIZACAO_'+action,descricao:description,metadados:JSON.stringify(meta)},{transaction:tx});
  const oldPrincipal=entry.antes_json.business.Solicitacao[0]?.status_global,newPrincipal=entry.depois_json.business.Solicitacao[0]?.status_global;
  if(sc.solicitacao_principal_id)await db.Historico.create({solicitacao_id:sc.solicitacao_principal_id,usuario_responsavel_id:userId,acao:'REORGANIZACAO_'+action,setor:'COMPRAS',descricao:description,
   status_anterior:action==='APLICADO'?oldPrincipal:newPrincipal,status_novo:action==='APLICADO'?newPrincipal:oldPrincipal,metadata:JSON.stringify(meta)},{transaction:tx});
 }
 async function run(config,userId,entryId,before,tx){
  const b=before.business,sc=b.SolicitacaoCompra[0];
  if(config.tipo==='TOTAL'){
   const now=new Date();await db.SolicitacaoCompra.update({status:'CANCELADA',encerrado_em:now,observacoes:[sc.observacoes,`Cancelada pelo usuário #${userId}. Motivo: ${config.motivo}`].filter(Boolean).join('\n')},{where:{id:sc.id},transaction:tx});
   if(config.cancelar_cotacao)await db.SolicitacaoCompraFornecedor.update({status:'CANCELADA'},{where:{solicitacao_compra_id:sc.id,status:{[Op.notIn]:['CANCELADA','CANCELADO']}},transaction:tx});
   if(config.cancelar_principal)await db.Solicitacao.update({status_global:'CANCELADA'},{where:{id:sc.solicitacao_principal_id},transaction:tx});
  }else{
   for(const p of b.PedidoCompra){const items=b.PedidoCompraItem.filter(i=>i.pedido_compra_id===p.id&&config.itens_saldo.includes(i.id));if(!items.length)continue;
    await require('./pedidoEntregaService').operarEntrega({pedidoId:p.id,compraId:sc.id,solicitacaoId:sc.solicitacao_principal_id,usuarioId:userId,transaction:tx,preservarRateios:true,payload:{acao:'CANCELAR_SALDO',motivo:config.motivo,idempotency_key:'reorg_'+entryId+'_'+p.id,itens:items.map(i=>({id:i.id,versao:b.PedidoCompraEntrega.find(e=>e.pedido_compra_item_id===i.id)?.versao||0}))}});
   }
   if(config.encerrar_saldo)await require('./pedidoCompraService').encerrarSaldoSolicitacaoCompraSemPedido({solicitacaoId:sc.id,usuarioId:userId,idempotencyKey:entryId,justificativa:config.motivo,transaction:tx});
  }
 }
 async function restore(entry,tx){
  for(const change of [...entry.alteracoes_json].reverse()){
   const s=specs[change.model],model=db[change.model],pk=s.pk||'id';let values;
   if(change.created){
    if(s.created==='ANULAR')values={status:'REVERTIDO'};
    else if(s.created==='ZERAR')values={valor_item_base:0,percentual_rateio:0,valor_rateado:0};
    else if(s.created==='CONTROLE')values={estado:'OBRA',prazo_compras:null,saldo_cancelado:0,previsao:null,versao:Number(change.row.versao||0)+1};
    else D.fail('REORG_RESTAURACAO_FORA_ESCOPO');
   }else{values=Object.fromEntries(Object.entries(change.fields).map(([k,v])=>[k,v.antes]));if(change.model==='PedidoCompraEntrega')values.versao=Number(change.fields.versao?.depois??entry.depois_json.business.PedidoCompraEntrega.find(e=>e[pk]===change.id).versao)+1;}
   const [count]=await model.update(values,{where:{[pk]:change.id},transaction:tx});D.check(count===1,'REORG_REGISTRO_AUSENTE_NA_REVERSAO');
  }
 }
 return{specs,capture,writeGuard,run,restore,audit,journal,createJournal:(v,tx)=>db.CompraReorganizacaoOperacao.create(v,{transaction:tx}),listJournal:where=>db.CompraReorganizacaoOperacao.findAll({where,order:[['solicitacao_compra_id','ASC']]}),transaction:fn=>db.sequelize.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},fn)};
}
function guardSql(sql,tableSpecs,auditTables){
 const text=String(sql).replace(/'(?:\\.|''|[^'\\])*'/g,"''").replace(/"(?:\\.|""|[^"\\])*"/g,'""').trim().replace(/;$/,'');
 D.check(!text.includes(';'),'REORG_SQL_EMPILHADO');
 if(/^(SELECT|SHOW)\b/i.test(text)){D.check(!/\b(OUTFILE|DUMPFILE)\b/i.test(text),'REORG_EXPORTACAO_SQL_PROIBIDA');return;}
 const match=text.match(/^(UPDATE|INSERT\s+INTO)\s+`([^`]+)`/i);D.check(match,'REORG_SQL_DESTRUTIVO_PROIBIDO');
 const [,verb,table]=match;if(auditTables.has(table))return;
 const s=tableSpecs.get(table);D.check(s,'REORG_ESCRITA_FORA_ESCOPO');
 if(/^INSERT/i.test(verb)){D.check(s.created,'REORG_CRIACAO_FORA_ESCOPO');return;}
 const set=text.match(/\bSET\s+([\s\S]+?)\s+WHERE\b/i);D.check(set,'REORG_UPDATE_INVALIDO');
 const cols=[...set[1].matchAll(/`([^`]+)`\s*=/g)].map(m=>m[1]);D.check(cols.length&&cols.every(k=>s.write.includes(k)||k==='updatedAt'),'REORG_CAMPO_FORA_ESCOPO');
}
module.exports={createStore,specs,guardSql};
