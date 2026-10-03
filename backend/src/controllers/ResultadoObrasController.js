'use strict';

const { gerarResultadoObras } = require('../services/resultadoObrasService');

module.exports = {
  async index(req, res) {
    try {
      return res.json(await gerarResultadoObras({ query: req.query }));
    } catch (error) {
      const status = Number(error?.statusCode || error?.status);
      if (Number.isInteger(status) && status >= 400 && status < 500) {
        return res.status(status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      }
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resultado de obras' });
    }
  }
};
