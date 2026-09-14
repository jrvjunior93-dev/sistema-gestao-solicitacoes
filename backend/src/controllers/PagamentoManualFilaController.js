const {
  aprovarDivergenciasFila,
  enfileirarTitulos,
  informarNaoPagamento,
  listarContasPagadorasFila,
  listarFilaPagamentos,
  registrarBaixasFila,
  resolverItemFila
} = require('../services/pagamentoManualFilaService');
const {
  linkReceipts,
  previewReceipts
} = require('../services/pagamentoComprovantePdfService');
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

  async previewComprovantes(req, res) {
    try {
      return res.json(await previewReceipts(req.files || []));
    } catch (error) {
      return responderErro(res, error, 'Erro ao ler comprovantes PDF');
    }
  },

  async vincularComprovantes(req, res) {
    try {
      return res.json(await linkReceipts(req, req.files || [], req.body?.vinculos));
    } catch (error) {
      return responderErro(res, error, 'Erro ao vincular comprovantes PDF');
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

  async aprovarDivergencias(req, res) {
    try {
      return res.json(await aprovarDivergenciasFila(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao aprovar divergencias de pagamento');
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
