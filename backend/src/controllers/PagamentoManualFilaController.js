const {
  enfileirarTitulos,
  informarNaoPagamento,
  listarContasPagadorasFila,
  listarFilaPagamentos,
  registrarBaixasFila,
  resolverItemFila
} = require('../services/pagamentoManualFilaService');
const { responderErroController } = require('../utils/controllerError');

function responderErro(res, error, fallback) {
  return responderErroController(res, error, fallback);
}

module.exports = {
  async index(req, res) {
    try {
      return res.json(await listarFilaPagamentos(req, req.query || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar fila de pagamentos');
    }
  },

  async contas(req, res) {
    try {
      return res.json(await listarContasPagadorasFila(req));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar contas pagadoras');
    }
  },

  async create(req, res) {
    try {
      return res.status(201).json(await enfileirarTitulos(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao enviar titulos para pagamento');
    }
  },

  async baixar(req, res) {
    try {
      return res.json(await registrarBaixasFila(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao registrar baixas da fila');
    }
  },

  async resultado(req, res) {
    try {
      return res.json(await informarNaoPagamento(req, req.params.id, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao registrar resultado do pagamento');
    }
  },

  async resolver(req, res) {
    try {
      return res.json(await resolverItemFila(req, req.params.id, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao resolver pendencia de pagamento');
    }
  }
};
