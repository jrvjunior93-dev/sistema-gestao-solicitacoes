const service = require('../services/rhTransferenciaService');
const { responderErroController } = require('../utils/controllerError');
const executar = fn => async (req, res) => {
  try { return res.json(await fn(req)); }
  catch (e) { return responderErroController(res, e, 'Erro no fluxo de transferencia entre obras'); }
};
module.exports = {
  configuracao: executar(req => service.configuracao(req.user)),
  diretorio: executar(req => service.diretorio(req.user, req.query)),
  index: executar(req => service.listar(req.user, req.query)),
  marcarListaLida: executar(req => service.marcarListaLida(req.user)),
  show: executar(req => service.detalhe(req.user, req.params.id)),
  create: executar(req => service.abrir(req.user, req.body || {})),
  agir: executar(req => service.agir(req.user, req.params.id, req.params.acao, req.body?.texto))
};
