const {
  atualizarEmpresaGrupoRh,
  criarEmpresaGrupoRh,
  listarEmpresasGrupoRh
} = require('../services/rhService');
const { responderErroController } = require('../utils/controllerError');

module.exports = {
  async catalogoConsulta(req, res) {
    try {
      const data = await require('../services/rhCatalogoConsultaService').empresasConsulta(req.user);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(data);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao carregar empresas do filtro RH/DP');
    }
  },
  async index(req, res) {
    try {
      const data = await listarEmpresasGrupoRh(req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar empresas do grupo');
    }
  },

  async create(req, res) {
    try {
      const data = await criarEmpresaGrupoRh(req.body || {}, req.user);
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao criar empresa do grupo');
    }
  },

  async update(req, res) {
    try {
      const data = await atualizarEmpresaGrupoRh(req.params.id, req.body || {}, req.user);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar empresa do grupo');
    }
  }
};
