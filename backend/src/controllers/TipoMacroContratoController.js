const { TipoMacroContrato } = require('../models');

module.exports = {
  async index(req, res) {
    try {
      const tipos = await TipoMacroContrato.findAll({
        order: [['nome', 'ASC']]
      });
      return res.json(tipos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar tipos macro' });
    }
  },

  async create(req, res) {
    try {
      const { nome } = req.body;
      if (!nome) {
        return res.status(400).json({ error: 'Nome Ã© obrigatÃ³rio' });
      }
      const tipo = await TipoMacroContrato.create({ nome });
      return res.status(201).json(tipo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar tipo macro' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome } = req.body;
      if (!nome) {
        return res.status(400).json({ error: 'Nome e obrigatorio' });
      }
      const tipo = await TipoMacroContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nao encontrado' });
      await tipo.update({ nome });
      return res.json(tipo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar tipo macro' });
    }
  },

  async ativar(req, res) {
    try {
      const { id } = req.params;
      const tipo = await TipoMacroContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nÃ£o encontrado' });
      await tipo.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar tipo macro' });
    }
  },

  async desativar(req, res) {
    try {
      const { id } = req.params;
      const tipo = await TipoMacroContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nÃ£o encontrado' });
      await tipo.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar tipo macro' });
    }
  }
};
