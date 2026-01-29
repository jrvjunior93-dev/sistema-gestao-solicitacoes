const { Setor } = require('../models');

module.exports = {

  async index(req, res) {
    try {
      const setores = await Setor.findAll({
        where: { ativo: true },
        order: [['nome', 'ASC']]
      });

      return res.json(setores);

    } catch (error) {
      console.error('Erro ao listar setores:', error);
      return res.status(500).json({
        error: 'Erro ao buscar setores'
      });
    }
  },

  async create(req, res) {
    try {
      const { nome, codigo } = req.body;

      const setor = await Setor.create({
        nome,
        codigo
      });

      return res.status(201).json(setor);

    } catch (error) {
      console.error('Erro ao criar setor:', error);
      return res.status(500).json({
        error: 'Erro ao criar setor'
      });
    }
  },

  async ativar(req, res) {
    try {
      const { id } = req.params;

      const setor = await Setor.findByPk(id);
      if (!setor) {
        return res.status(404).json({ error: 'Setor não encontrado' });
      }

      await setor.update({ ativo: true });

      return res.sendStatus(204);

    } catch (error) {
      console.error('Erro ao ativar setor:', error);
      return res.status(500).json({
        error: 'Erro ao ativar setor'
      });
    }
  },

  async desativar(req, res) {
    try {
      const { id } = req.params;

      const setor = await Setor.findByPk(id);
      if (!setor) {
        return res.status(404).json({ error: 'Setor não encontrado' });
      }

      await setor.update({ ativo: false });

      return res.sendStatus(204);

    } catch (error) {
      console.error('Erro ao desativar setor:', error);
      return res.status(500).json({
        error: 'Erro ao desativar setor'
      });
    }
  }

};
