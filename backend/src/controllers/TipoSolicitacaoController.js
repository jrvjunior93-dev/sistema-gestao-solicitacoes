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

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome } = req.body;

      if (!nome) {
        return res.status(400).json({ error: 'Nome e obrigatorio' });
      }

      const tipo = await TipoSolicitacao.findByPk(id);
      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      await tipo.update({ nome });
      return res.json(tipo);

    } catch (error) {
      console.error('Erro ao atualizar tipo:', error);
      return res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }
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
