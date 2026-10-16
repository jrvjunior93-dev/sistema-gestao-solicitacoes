'use strict';
const service = require('../services/contratoMedicaoEncerramentoService');
function falha(res, e) {
  const status = Number(e.statusCode) || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ error: status >= 500 ? 'Nao foi possivel atualizar a marcacao do contrato.' : e.message });
}
module.exports = {
  async consultar(req, res) { try { return res.json(await service.consultar(req.params.id, req.user)); } catch (e) { return falha(res, e); } },
  async alterar(req, res) { try { return res.json(await service.alterar(req.params.id, req.body, req.user)); } catch (e) { return falha(res, e); } }
};
