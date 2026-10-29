'use strict';
const service = require('../services/comprovanteCompartilhadoSolicitacaoService');
const { responderErroController } = require('../utils/controllerError');
exports.abrir = async (req, res) => {
  try {
    const result = await service.abrir(req, req.params.id, req.params.tituloId, req.params.filaId, req.query.comprovante_id);
    res.setHeader('Cache-Control', 'no-store'); return res.json(result);
  } catch (e) { return responderErroController(res, e, 'Erro ao abrir comprovante compartilhado.'); }
};
