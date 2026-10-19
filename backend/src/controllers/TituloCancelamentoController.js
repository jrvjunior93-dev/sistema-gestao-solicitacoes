'use strict';
const { cancelarTitulo } = require('../services/tituloCancelamentoService');
const { responderErroController } = require('../utils/controllerError');
module.exports = { async cancelar(req, res) {
  try { return res.json(await cancelarTitulo(req, req.params.id, req.body)); }
  catch (error) { return responderErroController(res, error, 'Nao foi possivel cancelar o titulo'); }
} };
