const {
  anexarContratoAssinadoComercial,
  VARIAVEIS_CONTRATO_COMERCIAL,
  criarModeloContratoComercial,
  enviarDocumentoD4Sign,
  excluirDocumentoContratoComercial,
  gerarDocumentoContratoComercial,
  listarDocumentosContratoComercial,
  listarModelosContratoComercial,
  obterLinkDocumentoContratoComercial,
  processarWebhookD4Sign
} = require('../services/comercialContratoDocumentoService');
const { responderErroController } = require('../utils/controllerError');

function responderErroDocumento(res, error, fallbackMessage) {
  if (error?.code === 'LIBREOFFICE_MISSING' || error?.code === 'LIBREOFFICE_CONVERT_FAILED') {
    return res.status(500).json({ error: error.message });
  }

  return responderErroController(res, error, fallbackMessage);
}

function assertWebhookSecret(req) {
  const secret = String(process.env.D4SIGN_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;

  const headerSecret = String(req.get('x-fluxy-webhook-secret') || '').trim();
  const querySecret = String(req.query?.secret || '').trim();
  return headerSecret === secret || querySecret === secret;
}

module.exports = {
  async variaveis(req, res) {
    return res.json({ variaveis: VARIAVEIS_CONTRATO_COMERCIAL });
  },

  async listarModelos(req, res) {
    try {
      const data = await listarModelosContratoComercial(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar modelos de contrato');
    }
  },

  async criarModelo(req, res) {
    try {
      const data = await criarModeloContratoComercial(req, req.body || {}, req.file);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao criar modelo de contrato');
    }
  },

  async listarDocumentosContrato(req, res) {
    try {
      const data = await listarDocumentosContratoComercial(req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar documentos do contrato');
    }
  },

  async anexarAssinado(req, res) {
    try {
      const data = await anexarContratoAssinadoComercial(req, req.params.id, req.file, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao anexar contrato assinado');
    }
  },

  async gerarDocumento(req, res) {
    try {
      const data = await gerarDocumentoContratoComercial(req, req.params.id, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroDocumento(res, error, 'Erro ao gerar documento do contrato');
    }
  },

  async obterLink(req, res) {
    try {
      const data = await obterLinkDocumentoContratoComercial(req.params.documentoId, req.query?.tipo);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar link do documento');
    }
  },

  async enviarD4Sign(req, res) {
    try {
      const data = await enviarDocumentoD4Sign(req, req.params.documentoId, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao enviar documento para D4Sign');
    }
  },

  async excluirDocumento(req, res) {
    try {
      const data = await excluirDocumentoContratoComercial(req, req.params.documentoId);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao excluir documento do contrato');
    }
  },

  async webhookD4Sign(req, res) {
    try {
      if (!assertWebhookSecret(req)) {
        return res.status(401).json({ error: 'Webhook nao autorizado' });
      }

      const data = await processarWebhookD4Sign(req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao processar webhook D4Sign' });
    }
  }
};
