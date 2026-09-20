const {
  abrirSessaoCaixa,
  confirmarConciliacaoDiaCaixa,
  decidirDivergenciaCaixa,
  estornarMovimentoCaixa,
  fecharSessaoCaixa,
  listarSessoesCaixa,
  obterPainelDiarioCaixas,
  obterResumoSessaoCaixa,
  registrarMovimentoCaixa
} = require('../services/caixaFinanceiroService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async index(req, res) {
    try {
      return res.json(await listarSessoesCaixa(req, req.query || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar caixas financeiros');
    }
  },

  async show(req, res) {
    try {
      return res.json(await obterResumoSessaoCaixa(req, req.params.id));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao buscar caixa financeiro');
    }
  },

  async painelDiario(req, res) {
    try {
      return res.json(await obterPainelDiarioCaixas(req, req.query?.data_referencia));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao montar o painel diario de contas');
    }
  },

  async abrir(req, res) {
    try {
      const sessao = await abrirSessaoCaixa(req, req.body || {});
      return res.status(201).json(sessao);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao abrir caixa financeiro');
    }
  },

  async confirmarConciliacaoDia(req, res) {
    try {
      return res.json(await confirmarConciliacaoDiaCaixa(req, req.body || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao confirmar conciliacao do dia');
    }
  },

  async registrarMovimento(req, res) {
    try {
      const resultado = await registrarMovimentoCaixa(req, req.params.id, req.body || {});
      return res.status(201).json(resultado);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar movimento de caixa');
    }
  },

  async estornarMovimento(req, res) {
    try {
      return res.json(await estornarMovimentoCaixa(req, req.params.id, req.params.movimentoId, req.body || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao estornar movimento de caixa');
    }
  },

  async fechar(req, res) {
    try {
      return res.json(await fecharSessaoCaixa(req, req.params.id, req.body || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao fechar caixa financeiro');
    }
  },

  async decidirDivergencia(req, res) {
    try {
      return res.json(await decidirDivergenciaCaixa(req, req.params.id, req.body || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao decidir divergencia do caixa');
    }
  }
};
