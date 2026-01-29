const { Obra } = require('../models');

module.exports = {
  async index(req, res) {
    const obras = await Obra.findAll({
      order: [['nome', 'ASC']]
    });
    res.json(obras);
  },

  async create(req, res) {
    const { nome } = req.body;

    const obra = await Obra.create({
      nome,
      ativo: true
    });

    res.status(201).json(obra);
  },

  async update(req, res) {
    const { id } = req.params;
    const { nome } = req.body;

    await Obra.update(
      { nome },
      { where: { id } }
    );

    res.sendStatus(204);
  },

  async ativar(req, res) {
    const { id } = req.params;

    await Obra.update(
      { ativo: true },
      { where: { id } }
    );

    res.sendStatus(204);
  },

  async desativar(req, res) {
    const { id } = req.params;

    await Obra.update(
      { ativo: false },
      { where: { id } }
    );

    res.sendStatus(204);
  }
};
