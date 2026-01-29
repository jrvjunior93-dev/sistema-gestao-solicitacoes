const { TipoSolicitacao } = require('../models');

module.exports = {
  async index(req, res) {
    const tipos = await TipoSolicitacao.findAll({
      order: [['nome', 'ASC']]
    });
    return res.json(tipos);
  },

  async create(req, res) {
    const { nome } = req.body;

    const tipo = await TipoSolicitacao.create({ nome });
    return res.status(201).json(tipo);
  },

  async ativar(req, res) {
    await TipoSolicitacao.update(
      { ativo: true },
      { where: { id: req.params.id } }
    );
    return res.sendStatus(204);
  },

  async desativar(req, res) {
    await TipoSolicitacao.update(
      { ativo: false },
      { where: { id: req.params.id } }
    );
    return res.sendStatus(204);
  }
};
