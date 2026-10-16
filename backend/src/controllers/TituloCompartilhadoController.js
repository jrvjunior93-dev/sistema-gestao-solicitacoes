'use strict';
const service = require('../services/tituloCompartilhadoService');
const executar = fn => async (req, res, next) => {
  try { return res.json(await fn(req)); } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return next(error);
  }
};
module.exports = {
  buscar: executar(req => service.buscar(req, req.query)),
  preview: executar(req => service.preview(req, req.body)),
  confirmar: executar(req => service.confirmar(req, req.body, req.get('Idempotency-Key'))),
  cancelar: executar(req => require('../services/tituloCompartilhadoCancelamento').cancelar(req, req.params.id, req.body))
};
