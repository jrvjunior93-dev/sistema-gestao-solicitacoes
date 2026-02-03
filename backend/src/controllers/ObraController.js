const { Obra, UsuarioObra } = require('../models');
const { Op } = require('sequelize');

module.exports = {
  async index(req, res) {
    const { codigo, descricao } = req.query;
    const where = {};

    if (codigo) {
      where.codigo = String(codigo).toUpperCase();
    }
    if (descricao) {
      where.nome = { [Op.like]: `%${descricao}%` };
    }

    const obras = await Obra.findAll({
      where,
      order: [['nome', 'ASC']]
    });
    res.json(obras);
  },

  async minhas(req, res) {
    try {
      const { id: usuarioId, perfil } = req.user;
      const { codigo, descricao } = req.query;

      if (perfil === 'SUPERADMIN') {
        const where = {};
        if (codigo) where.codigo = String(codigo).toUpperCase();
        if (descricao) where.nome = { [Op.like]: `%${descricao}%` };
        const obras = await Obra.findAll({
          where,
          order: [['nome', 'ASC']]
        });
        return res.json(obras);
      }

      if (codigo) {
        const obra = await Obra.findOne({
          where: { codigo: String(codigo).toUpperCase() }
        });
        if (!obra) return res.json([]);

        const vinculo = await UsuarioObra.findOne({
          where: { user_id: usuarioId, obra_id: obra.id }
        });
        return res.json(vinculo ? [obra] : []);
      }

      const vinculos = await UsuarioObra.findAll({
        where: { user_id: usuarioId },
        include: [
          {
            model: Obra,
            as: 'obra',
            where: descricao ? { nome: { [Op.like]: `%${descricao}%` } } : undefined
          }
        ]
      });

      const obras = vinculos.map(v => v.obra);
      return res.json(obras);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar obras do usuÃ¡rio' });
    }
  },

  async create(req, res) {
    const { nome, codigo, cidade } = req.body;

    if (!nome || !codigo) {
      return res.status(400).json({ error: 'Nome e codigo sao obrigatorios' });
    }

    const existente = await Obra.findOne({
      where: { codigo: String(codigo).toUpperCase() }
    });
    if (existente) {
      return res.status(400).json({ error: 'Codigo de obra ja cadastrado' });
    }

    const obra = await Obra.create({
      codigo: String(codigo).toUpperCase(),
      cidade: cidade || null,
      nome,
      ativo: true
    });

    res.status(201).json(obra);
  },

  async update(req, res) {
    const { id } = req.params;
    const { nome, codigo, cidade } = req.body;

    const dados = {};
    if (nome) dados.nome = nome;
    if (cidade !== undefined) dados.cidade = cidade || null;
    if (codigo !== undefined) {
      if (!codigo) {
        return res.status(400).json({ error: 'Codigo invalido' });
      }
      dados.codigo = String(codigo).toUpperCase();
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    if (dados.codigo) {
      const existente = await Obra.findOne({
        where: {
          codigo: dados.codigo,
          id: { [Op.ne]: id }
        }
      });
      if (existente) {
        return res.status(400).json({ error: 'Codigo de obra ja cadastrado' });
      }
    }

    await Obra.update(
      dados,
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
