const service = require('../services/rhPagamentoSolicitacaoService');
const { responderErroController } = require('../utils/controllerError');
const executar = metodo => async (req, res) => {
  try { return res.json(await service[metodo](req, ...(['iniciar', 'preparar', 'salvarNovo'].includes(metodo)
    ? [req.body || {}] : [req.params.id, req.body || {}]))); }
  catch (error) { return responderErroController(res, error, 'Erro na solicitacao de pagamento'); }
};
module.exports = { iniciar: executar('iniciar'), preparar: executar('preparar'), salvarNovo: executar('salvarNovo'), excluirRascunho: executar('excluirRascunho'), mostrar: executar('mostrar'), salvar: executar('salvar'), enviar: executar('enviar'), revisar: executar('revisar'),
  removerColaborador: executar('removerColaborador'), cancelar: executar('cancelarSolicitacaoPagamento') };
