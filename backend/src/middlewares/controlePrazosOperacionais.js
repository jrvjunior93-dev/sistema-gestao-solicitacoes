'use strict';
const service = require('../services/prazosOperacionaisService');
const rotas = require('../services/prazosOperacionaisRotaService');
const { agruparPendenciasEntrega } = require('../services/avisoPendenciasEntregaService');
function criarControle({ estado = service.estado, resolver = rotas.obrasDaOperacao } = {}) {
  return async (req, res, next) => {
    // POST transporta apenas a selecao do PDF; continua sendo consulta, como o GET.
    if (req.method === 'POST' && /^\/financeiro\/titulos\/relatorio\.pdf\/?$/i.test(req.path)) return next();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !rotas.MODULOS_OBRA.test(req.path)
      || rotas.CADASTROS_GLOBAIS.test(req.path) || rotas.regularizacao(req)) return next();
    // Nestes dois formulários o vínculo vem do multipart. A mesma guarda é obrigatória após o multer.
    if (rotas.FORMULARIOS_OBRA.has(req.path.toLowerCase().replace(/\/$/, '')) && req.is?.('multipart/form-data') && !req.prazosFormularioProcessado) return next();
    try {
      const situacao = await estado(req.user);
      const bloqueadas = situacao.obras.filter((o) => o.bloqueada);
      if (!bloqueadas.length) return next();
      const alvos = await resolver(req);
      // Uma escrita do módulo sem contexto identificável não pode contornar o bloqueio com obra_id forjado.
      const afetadas = alvos.length ? bloqueadas.filter((o) => alvos.includes(Number(o.id))) : bloqueadas;
      if (!afetadas.length) return next();
      return res.status(423).json({ codigo: 'OBRA_PRAZO_OPERACIONAL_PENDENTE',
        error: 'Esta obra possui informação de entrega vencida. Informe a entrega total, parcial ou não entrega para liberar suas operações. Consultas e o acompanhamento de entregas continuam disponíveis.',
        servidor_agora: situacao.servidor_agora, obras: afetadas,
        code: 'COMPRA_ENTREGA_PENDENTE',
        details: { solicitacoes: agruparPendenciasEntrega(afetadas.flatMap((obra) =>
          (obra.pendencias || []).filter((p) => Date.parse(p.limite_em) <= Date.parse(situacao.servidor_agora)))) }
      });
    } catch (error) {
      if (!error.statusCode) console.error('Verificação de prazo operacional indisponível:', error.message);
      return res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Não foi possível verificar os prazos da obra. Tente novamente; nenhuma operação foi autorizada.' });
    }
  };
}
module.exports = criarControle();
module.exports.criarControle = criarControle;
module.exports.aposFormulario = (req, res, next) => {
  req.prazosFormularioProcessado = true;
  return module.exports(req, res, next);
};
