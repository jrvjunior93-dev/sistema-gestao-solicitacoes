'use strict';

const { listarObrasElegiveisDistribuicao, configurarObrasDistribuicao, contextoConfiguracao } = require('../services/centroCustoDistribuicaoService');

module.exports = {
  async configuracao(req, res) {
    try { return res.json(await contextoConfiguracao(req.params.id, req.user)); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Erro ao carregar configuracao.' }); }
  },
  async salvarConfiguracao(req, res) {
    try { return res.json(await configurarObrasDistribuicao(req.params.id, req.body, req.user)); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Erro ao salvar configuracao.' }); }
  },
  async obrasElegiveis(req, res) {
    try {
      return res.json(await listarObrasElegiveisDistribuicao({
        centroCustoId: req.params.id,
        usuario: req.user,
        incluirCentrosCusto: true
      }));
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error(error);
      return res.status(status).json({
        error: status >= 500 ? 'Erro ao carregar obras e centros de custo para distribuicao gerencial.' : error.message
      });
    }
  }
};
