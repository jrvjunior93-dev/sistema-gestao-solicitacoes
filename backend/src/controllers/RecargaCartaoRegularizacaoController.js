'use strict';
const service = require('../services/recargaCartaoRegularizacaoService');
const { assertPodeVisualizarSolicitacao } = require('../services/solicitacaoRetornoService');
function handler(executar) {
  return async (req, res) => {
    try { return res.json(await executar(req)); }
    catch (error) { return res.status(Number(error.statusCode) || 500).json({ error: error.statusCode ? error.message : 'Erro ao regularizar recarga. Tente consultar novamente.' }); }
  };
}
module.exports = {
  listar: handler(req => service.listar(req.user, req.query)),
  consultar: handler(req => service.consultar(req.params.id, req.user)),
  regularizar: handler(async req => {
    const resultado = await service.regularizar(req.params.id, req.body || {}, req.user);
    let podeAbrir = false;
    if (resultado.recuperada) {
      try {
        // A regularizacao global nao autoriza detalhe, anexos ou outras acoes.
        // Revalidar em todo replay, pois a permissao do usuario pode ter mudado.
        await assertPodeVisualizarSolicitacao(req, resultado.solicitacao_id);
        podeAbrir = true;
      } catch (error) {
        if (![403, 404].includes(Number(error.statusCode))) console.error('Nao foi possivel conferir o acesso apos regularizacao:', error.message);
      }
    }
    return { ...resultado, pode_abrir_solicitacao: podeAbrir };
  })
};
