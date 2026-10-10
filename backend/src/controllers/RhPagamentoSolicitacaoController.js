const service = require('../services/rhPagamentoSolicitacaoService');
const { responderErroController } = require('../utils/controllerError');
const executar = metodo => async (req, res) => {
  try { return res.json(await service[metodo](req, ...(metodo === 'iniciar'
    ? [req.body || {}] : [req.params.id, req.body || {}]))); }
  catch (error) { return responderErroController(res, error, 'Erro na solicitacao de pagamento'); }
};
module.exports = { iniciar: executar('iniciar'), mostrar: executar('mostrar'), salvar: executar('salvar'), enviar: executar('enviar') };
