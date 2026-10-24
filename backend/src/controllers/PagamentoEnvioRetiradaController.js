const service = require('../services/pagamentoEnvioRetiradaService');
const { responderErroController } = require('../utils/controllerError');
module.exports = {
  async preview(req, res) {
    res.set('Cache-Control', 'private, no-store');
    try { return res.json(await service.preview(req, req.body)); }
    catch (e) { return responderErroController(res, e, 'Nao foi possivel conferir a retirada.'); }
  },
  async confirmar(req, res) {
    res.set('Cache-Control', 'private, no-store');
    try { return res.json(await service.confirmar(req, req.body)); }
    catch (e) { return responderErroController(res, e, 'Nao foi possivel retirar os envios.'); }
  }
};
