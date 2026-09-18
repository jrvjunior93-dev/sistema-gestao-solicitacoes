const service=require('../services/tituloRenegociacaoService');
const {responderErroController}=require('../utils/controllerError');
module.exports={
  async consultar(req,res){try{return res.json(await service.consultar(req,Number(req.params.id)));}
    catch(e){return responderErroController(res,e,'Erro ao consultar a negociação.');}},
  async preview(req,res){try{return res.json(await service.preview(req,req.body));}
    catch(e){return responderErroController(res,e,'Erro ao preparar a negociação.');}},
  async confirmar(req,res){try{return res.status(201).json(await service.confirmar(req,req.body,req.get('Idempotency-Key')));}
    catch(e){return responderErroController(res,e,'Erro ao confirmar a negociação.');}}
};
