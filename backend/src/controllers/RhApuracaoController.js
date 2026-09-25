const {
  conferirApuracaoRh,
  detalharApuracaoRh,
  gerarApuracaoMultiobraRh,
  gerarApuracaoRh,
  listarJornadasMultiobraRh,
  listarApuracoesRh,
  atualizarItemApuracaoRh
} = require('../services/rhApuracaoService');
const { responderErroController } = require('../utils/controllerError');
const { CategoriaFinanceira } = require('../models');

module.exports = {
  async categoriasFinanceiras(req, res) {
    try {
      const data = await CategoriaFinanceira.findAll({ order: [['nome', 'ASC']] });
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar categorias financeiras da apuracao RH/DP');
    }
  },

  async index(req, res) {
    try {
      const data = await listarApuracoesRh(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar apuracoes RH/DP');
    }
  },

  async show(req, res) {
    try {
      const data = await detalharApuracaoRh(req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao buscar apuracao RH/DP');
    }
  },

  async create(req, res) {
    try {
      const data = await gerarApuracaoRh(req.body || {}, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar apuracao RH/DP');
    }
  },

  async jornadasMultiobra(req, res) {
    try {
      return res.json(await listarJornadasMultiobraRh(req.query || {}));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar jornadas multiobra do RH/DP');
    }
  },

  async consolidarMultiobra(req, res) {
    try {
      const data = await gerarApuracaoMultiobraRh(req.body || {}, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao consolidar jornadas multiobra');
    }
  },

  async updateItem(req, res) {
    try {
      const data = await atualizarItemApuracaoRh(
        req.params.id,
        req.params.itemId,
        req.body || {},
        req.user
      );
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar item da apuracao RH/DP');
    }
  },

  async conferir(req, res) {
    try {
      const data = await conferirApuracaoRh(req.params.id, req.user);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao conferir apuracao RH/DP');
    }
  }
};
