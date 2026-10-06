const service = require('../services/prazosOperacionaisService');
const domain = require('../services/prazosOperacionaisDomain');
const { registrarEventoSeguranca } = require('../services/securityLogService');
function endpoint(fn) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fn(req)); }
    catch (error) { console.error('Prazos operacionais:', error.message); res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Não foi possível consultar os prazos operacionais.' }); }
  };
}
module.exports = {
  estado: endpoint((req) => service.estado(req.user)),
  configuracao: endpoint(async () => ({ regra: await service.configuracao(), futuras: domain.FUTURAS })),
  salvar: endpoint(async (req) => {
    const anterior = await service.configuracao(), regra = await service.salvarConfig(req.body, req.user.id);
    await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PRAZOS_OPERACIONAIS_CONFIGURADOS',
      recursoTipo: 'CONFIGURACAO', status: 'SUCCESS', descricao: 'Regra de entregas da Obra configurada.', metadata: { anterior, regra } });
    return { regra, futuras: domain.FUTURAS };
  }),
  liberar: endpoint(async (req) => {
    const liberacao = await service.liberar(req.body, req.user.id);
    await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PRAZOS_OPERACIONAIS_LIBERACAO',
      recursoTipo: 'OBRA', recursoId: liberacao.obra_id, status: 'SUCCESS', descricao: liberacao.motivo,
      metadata: { liberacao_id: liberacao.id, ate: liberacao.ate } });
    return { liberacao };
  })
};
