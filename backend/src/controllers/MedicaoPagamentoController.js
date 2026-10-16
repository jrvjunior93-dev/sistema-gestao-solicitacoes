'use strict';
const service = require('../services/medicaoPagamentoService');
const { responderErroController } = require('../utils/controllerError');
module.exports = {
  async consultar(req, res) {
    try { return res.json(await service.consultar(req, Number(req.params.id), Number(req.params.medicaoId))); }
    catch (e) { return responderErroController(res, e, 'Erro ao consultar valores da medicao'); }
  },
  async alterar(req, res) {
    try { return res.json(await service.alterar(req, Number(req.params.id), Number(req.params.medicaoId), req.body)); }
    catch (e) { return responderErroController(res, e, 'Erro ao ajustar valor para pagamento'); }
  }
};
