const {
  atualizarDocumentoRh,
  criarDocumentoRh,
  detalharDocumentoRh,
  listarDocumentosRh,
  listarTiposDocumentoRh,
  obterLinkDocumentoRh,
  substituirDocumentoRh
} = require('../services/rhService');
const {
  listarDossieColaboradorRh,
  obterLinkArquivoDossieRh
} = require('../services/rhDossieService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async listarTipos(req, res) {
    try {
      const data = await listarTiposDocumentoRh(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar tipos de documento RH/DP');
    }
  },

  async index(req, res) {
    try {
      const data = await listarDocumentosRh(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar documentos RH/DP');
    }
  },

  async dossie(req, res) {
    try {
      const data = await listarDossieColaboradorRh(req.params.colaboradorId);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao carregar o dossie do colaborador');
    }
  },

  async obterLinkDossie(req, res) {
    try {
      const data = await obterLinkArquivoDossieRh(
        req.params.colaboradorId,
        String(req.params.origem || '').toUpperCase(),
        req.params.arquivoId,
        req.query?.fila_id || null
      );
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar link do arquivo do dossie');
    }
  },

  async show(req, res) {
    try {
      const data = await detalharDocumentoRh(req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao buscar documento RH/DP');
    }
  },

  async create(req, res) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Arquivo do documento nao enviado.' });
      }

      const data = await criarDocumentoRh(req.body || {}, req.file, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao criar documento RH/DP');
    }
  },

  async update(req, res) {
    try {
      const data = await atualizarDocumentoRh(req.params.id, req.body || {}, req.user);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar documento RH/DP');
    }
  },

  async substituir(req, res) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Arquivo do documento nao enviado.' });
      }

      const data = await substituirDocumentoRh(req.params.id, req.body || {}, req.file, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao substituir documento RH/DP');
    }
  },

  async obterLink(req, res) {
    try {
      const data = await obterLinkDocumentoRh(req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar link do documento RH/DP');
    }
  }
};
