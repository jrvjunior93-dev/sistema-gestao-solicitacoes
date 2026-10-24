'use strict';
const service=require('../services/fiscalPurchaseLinkService');
const execute=action=>async(req,res)=>{
  try {return res.json(await action(req));}
  catch(error){const status=Number(error.statusCode);return res.status(status>=400 && status<500 ? status : 500).json({error:status>=400 && status<500 ? error.message : 'Nao foi possivel conferir os vinculos fiscais.'});}
};
const key=req=>String(req.get('Idempotency-Key')||'').trim();
module.exports={
  search:execute(req=>service.search(req,req.query)),
  read:execute(req=>service.read(req,req.query)),
  save:execute(req=>service.save(req,req.params.id,req.body,key(req))),
  remove:execute(req=>service.remove(req,req.params.id,req.params.pedidoId,req.body,key(req)))
};
