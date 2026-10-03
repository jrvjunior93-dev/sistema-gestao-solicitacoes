'use strict';

const {
  cancelarRetorno,
  decidirRetorno,
  devolverAoSetorAnterior,
  solicitarRetorno
} = require('../services/solicitacaoRetornoService');

function responderErro(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    error: status >= 500 ? fallback : error.message,
    code: error?.code || undefined
  });
}

module.exports = {
  async solicitar(req, res) {
    try {
      const resultado = await solicitarRetorno(req, Number(req.params.id), req.body?.motivo);
      return res.status(resultado.duplicado ? 200 : 201).json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao solicitar retorno da solicitacao');
    }
  },

  async decidir(req, res) {
    try {
      const resultado = await decidirRetorno(req, Number(req.params.pedidoId), {
        aprovar: req.body?.aprovar === true,
        motivoDecisao: req.body?.motivo_decisao
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao decidir o retorno da solicitacao');
    }
  },

  async cancelar(req, res) {
    try {
      return res.json(await cancelarRetorno(req, Number(req.params.pedidoId)));
    } catch (error) {
      return responderErro(res, error, 'Erro ao cancelar o pedido de retorno');
    }
  },

  async devolver(req, res) {
    try {
      return res.json(await devolverAoSetorAnterior(req, Number(req.params.id)));
    } catch (error) {
      return responderErro(res, error, 'Erro ao devolver a solicitacao ao setor anterior');
    }
  }
};
