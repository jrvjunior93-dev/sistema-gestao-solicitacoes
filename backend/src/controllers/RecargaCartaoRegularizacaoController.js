'use strict';
const service = require('../services/recargaCartaoRegularizacaoService');
function handler(executar) {
  return async (req, res) => {
    try { return res.json(await executar(req)); }
    catch (error) { return res.status(Number(error.statusCode) || 500).json({ error: error.statusCode ? error.message : 'Erro ao regularizar recarga. Tente consultar novamente.' }); }
  };
}
module.exports = {
  listar: handler(req => service.listar(req.user, req.query)),
  consultar: handler(req => service.consultar(req.params.id, req.user)),
  regularizar: handler(req => service.regularizar(req.params.id, req.body || {}, req.user))
};
