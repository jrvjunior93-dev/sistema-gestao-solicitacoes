const {
  detalharFechamentoRh,
  fecharApuracaoRh,
  listarFechamentosRh,
  reabrirFechamentoRh,
  obterComprovanteFechamentoRh
} = require('../services/rhFechamentoService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async index(req, res) {
    try {
      const data = await listarFechamentosRh(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar fechamentos RH/DP');
    }
  },

  async show(req, res) {
    try {
      const data = await detalharFechamentoRh(req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao buscar fechamento RH/DP');
    }
  },

  async obterComprovante(req, res) {
    try {
      const data = await obterComprovanteFechamentoRh(
        req.params.id,
        req.params.filaId,
        req.params.comprovanteId || null
      );
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar link do comprovante do fechamento RH/DP');
    }
  },

  async fecharApuracao(req, res) {
    try {
      const data = await fecharApuracaoRh(req.params.id, req.body || {}, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao fechar a apuracao RH/DP');
    }
  },

  async reabrir(req, res) {
    try {
      const data = await reabrirFechamentoRh(req.params.id, req.body || {}, req.user);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao reabrir o fechamento RH/DP');
    }
  }
};
