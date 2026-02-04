const { Cargo } = require('../models');

module.exports = {
  async index(req, res) {
    const cargos = await Cargo.findAll({
      order: [['nome', 'ASC']]
    });
    return res.json(cargos);
  },

  async create(req, res) {
    const { nome, codigo } = req.body;

    const cargo = await Cargo.create({
      nome,
      codigo
    });

    return res.status(201).json(cargo);
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome, codigo } = req.body;

      if (!nome && !codigo) {
        return res.status(400).json({ error: 'Nada para atualizar' });
      }

      const cargo = await Cargo.findByPk(id);
      if (!cargo) {
        return res.status(404).json({ error: 'Cargo nao encontrado' });
      }

      await cargo.update({
        nome: nome || cargo.nome,
        codigo: codigo ? String(codigo).toUpperCase() : cargo.codigo
      });

      return res.json(cargo);

    } catch (error) {
      console.error('Erro ao atualizar cargo:', error);
      return res.status(500).json({ error: 'Erro ao atualizar cargo' });
    }
  },

  async ativar(req, res) {
    await Cargo.update(
      { ativo: true },
      { where: { id: req.params.id } }
    );
    return res.sendStatus(204);
  },

  async desativar(req, res) {
    await Cargo.update(
      { ativo: false },
      { where: { id: req.params.id } }
    );
    return res.sendStatus(204);
  }
};
