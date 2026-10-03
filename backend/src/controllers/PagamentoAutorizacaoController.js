const service = require('../services/pagamentoAutorizacaoService');
const { responderErroController } = require('../utils/controllerError');

function fail(res, error, fallback) {
  return responderErroController(res, error, fallback);
}

module.exports = {
  async capabilities(req, res) {
    try { return res.json(await service.capabilitiesForUser(req.user)); }
    catch (error) { return fail(res, error, 'Erro ao consultar autorizacoes de pagamento'); }
  },
  async index(req, res) {
    try { return res.json({ data: await service.listBatches(req, req.query || {}) }); }
    catch (error) { return fail(res, error, 'Erro ao listar autorizacoes de pagamento'); }
  },
  async show(req, res) {
    try { return res.json(await service.getBatch(req, req.params.id)); }
    catch (error) { return fail(res, error, 'Erro ao abrir autorizacao de pagamento'); }
  },
  async create(req, res) {
    try { return res.status(201).json(await service.createBatch(req, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao preparar autorizacao de pagamento'); }
  },
  async document(req, res) {
    try { return res.json(await service.openDocument(req, req.params.id)); }
    catch (error) { return fail(res, error, 'Erro ao abrir documento do dossie'); }
  },
  async registrationOptions(req, res) {
    try { return res.json(await service.registrationOptions(req)); }
    catch (error) { return fail(res, error, 'Erro ao iniciar cadastro da passkey'); }
  },
  async verifyRegistration(req, res) {
    try { return res.status(201).json(await service.verifyRegistration(req, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao cadastrar passkey'); }
  },
  async passkeys(req, res) {
    try { return res.json({ data: await service.listPasskeys(req) }); }
    catch (error) { return fail(res, error, 'Erro ao listar passkeys'); }
  },
  async revokePasskey(req, res) {
    try { return res.json(await service.revokePasskey(req, req.params.id)); }
    catch (error) { return fail(res, error, 'Erro ao revogar passkey'); }
  },
  async authenticationOptions(req, res) {
    try { return res.json(await service.authenticationOptions(req, req.params.id, req.body?.decisoes)); }
    catch (error) { return fail(res, error, 'Erro ao iniciar confirmacao por passkey'); }
  },
  async decide(req, res) {
    try { return res.json(await service.decideBatch(req, req.params.id, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao registrar decisao de pagamento'); }
  },
  async enqueue(req, res) {
    try { return res.json(await service.enqueueAuthorizedItems(req, req.params.id)); }
    catch (error) { return fail(res, error, 'Erro ao encaminhar itens autorizados para a fila'); }
  },
  async authorizers(req, res) {
    try { return res.json({ data: await service.listAuthorizers(req) }); }
    catch (error) { return fail(res, error, 'Erro ao listar autorizadores'); }
  },
  async saveAuthorizer(req, res) {
    try { return res.json(await service.saveAuthorizer(req, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao configurar autorizador'); }
  },
  async subscribePush(req, res) {
    try { return res.status(201).json(await service.subscribePush(req, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao ativar notificacoes push'); }
  },
  async unsubscribePush(req, res) {
    try { return res.json(await service.unsubscribePush(req, req.body || {})); }
    catch (error) { return fail(res, error, 'Erro ao desativar notificacoes push'); }
  }
};
