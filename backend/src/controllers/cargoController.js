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
