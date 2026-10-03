const { catalogarItemManual, CatalogacaoInsumoError } = require('../services/insumoManualCatalogacaoService');

module.exports = {
  async catalogar(req, res) {
    try {
      const resultado = await catalogarItemManual({
        solicitacaoCompraId: Number(req.params.id),
        itemManualId: Number(req.params.itemId),
        usuarioId: Number(req.user?.id),
        payload: req.body || {}
      });

      return res.status(resultado.ja_catalogado ? 200 : 201).json(resultado);
    } catch (error) {
      if (error instanceof CatalogacaoInsumoError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          details: error.details || undefined
        });
      }
      if (error?.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          error: 'Outro usuario cadastrou este codigo ou alias ao mesmo tempo. Atualize a tela e tente novamente.',
          code: 'CATALOGACAO_CONCORRENTE'
        });
      }

      console.error(error);
      return res.status(500).json({ error: 'Erro ao catalogar item manual.' });
    }
  }
};
