const {
  listarStatusInternosPagar,
  criarStatusInternoPagar,
  atribuirStatusInternoPagar
} = require('../services/statusInternoContasPagarService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async index(req, res) {
    try { return res.json(await listarStatusInternosPagar()); }
    catch (error) { return responderErroController(res, error, 'Erro ao consultar status internos'); }
  },
  async create(req, res) {
    try {
      if (Object.keys(req.body || {}).some((key) => key !== 'nome')) return res.status(400).json({ error: 'Campos nao permitidos.' });
      return res.status(201).json(await criarStatusInternoPagar(req.body?.nome));
    } catch (error) { return responderErroController(res, error, 'Erro ao criar status interno'); }
  },
  async atribuir(req, res) {
    try {
      if (Object.keys(req.body || {}).some((key) => !['titulo_ids', 'status_interno_pagar'].includes(key))) {
        return res.status(400).json({ error: 'Campos nao permitidos.' });
      }
      return res.json(await atribuirStatusInternoPagar(req.user, req.body?.titulo_ids, req.body?.status_interno_pagar));
    } catch (error) { return responderErroController(res, error, 'Erro ao alterar status interno'); }
  }
};
