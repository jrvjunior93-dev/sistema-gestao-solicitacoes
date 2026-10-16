'use strict';
const { desvincularFaturaTitulo } = require('../services/tituloDesvincularFaturaService');
const { responderErroController } = require('../utils/controllerError');
module.exports = { async desvincular(req, res) {
  try { return res.json(await desvincularFaturaTitulo(req, req.params.id, req.body)); }
  catch (error) { return responderErroController(res, error, 'Nao foi possivel desvincular a previsao de cartao'); }
} };
