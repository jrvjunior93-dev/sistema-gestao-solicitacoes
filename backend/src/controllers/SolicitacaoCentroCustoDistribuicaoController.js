'use strict';

const { listarObrasElegiveisDistribuicao } = require('../services/centroCustoDistribuicaoService');

module.exports = {
  async obrasElegiveis(req, res) {
    try {
      return res.json(await listarObrasElegiveisDistribuicao({
        centroCustoId: req.params.id,
        usuario: req.user
      }));
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error(error);
      return res.status(status).json({
        error: status >= 500 ? 'Erro ao carregar as obras para distribuicao do centro de custo.' : error.message
      });
    }
  }
};
