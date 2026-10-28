'use strict';
const service = require('../services/rhColaboradorObraService');
const { responderErroController } = require('../utils/controllerError');
const executar = metodo => async (req, res) => {
  try {
    const result = await service[metodo](req, req.params.id,
      ...(metodo === 'linkDocumento' ? [req.params.documentoId] : metodo === 'enviarDocumento' ? [req.body || {}, req.file] : [req.body || {}]));
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (e) { return responderErroController(res, e, 'Erro no cadastro limitado do colaborador'); }
};
module.exports = Object.fromEntries(['mostrar', 'salvarObservacoes', 'enviarDocumento', 'linkDocumento'].map(m => [m, executar(m)]));
