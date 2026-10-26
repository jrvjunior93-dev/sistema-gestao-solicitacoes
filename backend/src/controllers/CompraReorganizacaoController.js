'use strict';
const D=require('../services/compraReorganizacaoDomain');
function createController({db,auth,scope,capability,storeFactory,serviceFactory}){
 function service(req){
  const authorize=async(user,c,direction,snapshot)=>{
   const sc=snapshot.business.SolicitacaoCompra[0];D.check(user?.ativo!==false,'REORG_SESSAO_OBRIGATORIA',401);
   D.check(await auth.canAccessCompras(user),'REORG_ACESSO_NEGADO',403);
   D.check(await auth.canAccessSolicitacaoCompraByScope(user,sc),'REORG_FORA_ESCOPO',403);
   const scoped=Object.assign(Object.create(req),{method:'POST',params:{id:sc.id}}),response={status(code){this.code=code;return this;},json(){D.fail('REORG_FORA_ESCOPO',this.code||403);}};
   await scope(scoped,response,()=>{});
   const resource=scoped.solicitacaoCompraResource;D.check(resource&&['id','obra_id','solicitante_id','comprador_responsavel_id'].every(k=>Number(resource[k]||0)===Number(sc[k]||0)),'REORG_ESCOPO_ALTERADO');
   if(direction==='CONSULTAR'){D.check(await auth.canViewCompraSolicitacoes(user),'REORG_ACESSO_NEGADO',403);return;}
   const needed=[];
   if(c.tipo==='TOTAL')needed.push('canDeleteCompraSolicitacoes');
   if(c.cancelar_cotacao)needed.push('canCancelarComprasCotacoes');
   if(c.encerrar_saldo)needed.push('canEncerrarSemPedidoComprasCotacoes');
   if(c.itens_saldo.length){needed.push('canCancelarComprasPedidos');D.check(user.perfil==='SUPERADMIN'||await capability(user,'eh_setor_compras'),'REORG_SETOR_ENTREGA_NEGADO',403);}
   if(direction==='REVERTER'){needed.push('canReabrirComprasCotacoes');if(c.itens_saldo.length)needed.push('canReabrirComprasPedidos');}
   for(const name of needed)D.check(typeof auth[name]==='function'&&await auth[name](user),'REORG_ACESSO_NEGADO',403);
  };
  return serviceFactory(storeFactory(db),authorize);
 }
 const handle=(allowed,action)=>async(req,res)=>{try{D.check(req.user,'REORG_SESSAO_OBRIGATORIA',401);if(allowed)D.keys(req.body,allowed);const s=service(req);return res.json(await action(s,req));}catch(e){return res.status(e.statusCode||500).json({error:D.safeError(e)});}};
 return{
  simulate:handle(['itens'],(s,r)=>s.simulate(r.user,r.body.itens)),
  apply:handle(['plano','sc_ids','confirmacao'],(s,r)=>s.apply(r.user,{...r.body,lote_id:r.params.loteId})),
  simulateReverse:handle(['sc_ids','todas','motivo'],(s,r)=>s.simulateReverse(r.user,{...r.body,lote_id:r.params.loteId})),
  reverse:handle(['plano','sc_ids','motivo','confirmacao'],(s,r)=>{D.check(r.body.plano?.lote_id===r.params.loteId,'REORG_LOTE_DIVERGENTE',400);return s.reverse(r.user,r.body);}),
  status:handle(null,(s,r)=>s.status(r.user,r.params.loteId))
 };
}
let defaults;
function load(){if(!defaults)defaults=createController({db:require('../models'),auth:require('../services/authorizationService'),scope:require('../middlewares/resourceAccess').requireCompraAccess,
 capability:require('../services/setorCapabilityService').userHasSetorCapability,storeFactory:require('../services/compraReorganizacaoStore').createStore,serviceFactory:require('../services/compraReorganizacaoService').createService});return defaults;}
module.exports={createController,...Object.fromEntries(['simulate','apply','simulateReverse','reverse','status'].map(k=>[k,(...args)=>load()[k](...args)]))};
