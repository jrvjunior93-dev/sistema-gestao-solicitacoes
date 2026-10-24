'use strict';
const {responderErroController}=require('../utils/controllerError');
function createController(dependencies){
  return async function index(req,res){
    try{
      const d=dependencies||{User:require('../models').User,auth:require('../services/authorizationService'),localizar:require('../services/pedidoLocalizacaoService').localizarPedidos};
      const user=req.user?.id?await d.User.findByPk(req.user.id,{attributes:['id','nome','email','perfil','setor_id','pode_criar_solicitacao_compra']}):null;
      if(!user)return res.status(401).json({error:'Usuario nao autenticado'});
      if(!(await d.auth.canViewComprasPedidos(user))||!(await d.auth.canViewComprasRelatorios(user))||await d.auth.getComprasVisibilityScope(user)==='NENHUM'){
        return res.status(403).json({error:'Acesso negado a consulta de pedidos'});
      }
      if(!Object.hasOwn(req,'compraScopeObraIds'))return res.status(403).json({error:'Escopo de obras nao conferido'});
      const all=await d.auth.canViewAllComprasScope(user)||await d.auth.canViewPedidoCompraFinanceiro(user);
      const result=await d.localizar(req.query,{obraIds:req.compraScopeObraIds,userId:all?null:Number(user.id)});
      res.setHeader('Cache-Control','private, no-store');
      return res.json(result);
    }catch(error){return responderErroController(res,error,'Erro ao consultar pedidos de compra');}
  };
}
module.exports={index:createController(),createController};
