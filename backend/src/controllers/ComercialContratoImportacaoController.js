const {
  carregarImportacao,
  confirmarImportacao,
  criarPreviewImportacao,
  gerarModeloImportacao
} = require('../services/comercialContratoImportacaoService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async modelo(req, res) {
    try {
      const { buffer, filename } = await gerarModeloImportacao(req);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar modelo de importacao Sienge');
    }
  },

  async preview(req, res) {
    try {
      return res.status(201).json(await criarPreviewImportacao(req, req.file));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao validar importacao Sienge');
    }
  },

  async show(req, res) {
    try {
      return res.json(await carregarImportacao(req, req.params.id));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao consultar importacao Sienge');
    }
  },

  async confirmar(req, res) {
    try {
      return res.json(await confirmarImportacao(req, req.params.id, {
        idempotencyKey: req.get('Idempotency-Key'),
        aceitarAvisos: Boolean(req.body?.aceitar_avisos)
      }));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao confirmar importacao Sienge');
    }
  }
};
