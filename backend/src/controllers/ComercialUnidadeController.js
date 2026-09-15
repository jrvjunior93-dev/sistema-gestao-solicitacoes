const {
  atualizarUnidadeComercial,
  atualizarConfiguracaoUnidadesComerciais,
  criarUnidadeComercial,
  listarUnidadesComerciais,
  obterConfiguracaoUnidadesComerciais
} = require('../services/comercialService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async index(req, res) {
    try {
      const data = await listarUnidadesComerciais(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar unidades comerciais');
    }
  },

  async create(req, res) {
    try {
      const data = await criarUnidadeComercial(req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao criar unidade comercial');
    }
  },

  async update(req, res) {
    try {
      const data = await atualizarUnidadeComercial(req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar unidade comercial');
    }
  },

  async configuracao(req, res) {
    try {
      return res.json(await obterConfiguracaoUnidadesComerciais());
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao consultar configuracao das unidades comerciais');
    }
  },

  async atualizarConfiguracao(req, res) {
    try {
      return res.json(await atualizarConfiguracaoUnidadesComerciais(req, req.body || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar configuracao das unidades comerciais');
    }
  }
};
