'use strict';
const service = require('../services/adiantamentoService');
const executar = acao => async (req, res) => {
  try { return res.json(await service[acao](req)); }
  catch (error) {
    if (!error.statusCode) console.error(error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Erro ao processar adiantamento.' });
  }
};
module.exports = { contexto: executar('contexto'), enviar: executar('enviar'), decidir: executar('decidir') };
