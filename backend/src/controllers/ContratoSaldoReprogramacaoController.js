const service = require('../services/contratoSaldoReprogramacaoService');
function falha(res, erro) {
  const status = Number(erro.statusCode) || 500;
  if (status >= 500) console.error(erro);
  return res.status(status).json({ error: status >= 500 ? 'Nao foi possivel reprogramar o saldo.' : erro.message });
}
module.exports = {
  async consultar(req, res) {
    try { return res.json(await service.consultar(req.params.id, req.user)); }
    catch (e) { return falha(res, e); }
  },
  async reprogramar(req, res) {
    try { return res.json(await service.reprogramar(req.params.id, req.body, { usuario: req.user, req })); }
    catch (e) { return falha(res, e); }
  }
};
