'use strict';
const favorecido = require('../services/favorecidoEdicaoService');
const rejeicao = require('../services/medicaoRejeicaoService');
const { responderErroController } = require('../utils/controllerError');
const handler = (fn, message) => async (req, res) => {
  try { return res.json(await fn(req, Number(req.params.id), req.body)); }
  catch (e) {
    // Sem payload/PIX/dados bancarios nos logs operacionais.
    if (!e.statusCode || e.statusCode >= 500) console.error('[MEDICAO_OPERACAO_FALHOU]', {
      operacao: message, usuario_id: req.user?.id, recurso_id: req.params.id, codigo: e.code || e.name || 'ERRO_INTERNO'
    });
    return responderErroController(res, e, message);
  }
};
module.exports = {
  consultarFavorecido: handler(favorecido.consultarMedicao, 'Erro ao consultar favorecido da medicao'),
  alterarFavorecido: handler(favorecido.alterarMedicao, 'Erro ao alterar favorecido da medicao'),
  consultarTitulo: handler(favorecido.consultarTitulo, 'Erro ao consultar favorecido do titulo'),
  alterarTitulo: handler(favorecido.alterarTitulo, 'Erro ao alterar favorecido do titulo'),
  consultarRejeicao: handler(rejeicao.consultar, 'Erro ao consultar medicao'),
  rejeitar: handler(rejeicao.rejeitar, 'Erro ao rejeitar medicao')
};
