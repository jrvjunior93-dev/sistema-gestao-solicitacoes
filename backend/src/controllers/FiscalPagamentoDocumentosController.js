'use strict';
const service=require('../services/fiscalPagamentoDocumentosService');
const {responderErroController}=require('../utils/controllerError');
function handler(type,dependencies=service){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{return res.json(await(type==='owner'?dependencies.owner(req,req.query):dependencies.queue(req,req.params.id,req.query)));}
  catch(e){return responderErroController(res,e,'Nao foi possivel consultar a NF-e deste pagamento.');}
};}
module.exports={owner:handler('owner'),queue:handler('queue'),createController:dependencies=>({owner:handler('owner',dependencies),queue:handler('queue',dependencies)})};
