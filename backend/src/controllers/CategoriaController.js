const { Categoria, Insumo } = require('../models');

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

module.exports = {
  async index(req, res) {
    try {
      const categorias = await Categoria.findAll({
        where: { ativo: true },
        order: [['nome', 'ASC']]
      });

      return res.json(categorias);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar categorias' });
    }
  },

  async create(req, res) {
    try {
      const nome = String(req.body?.nome || '').trim();

      if (!nome) {
        return res.status(400).json({ error: 'Informe o nome' });
      }

      const categoria = await Categoria.create({ nome });
      return res.status(201).json(categoria);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const categoria = await Categoria.findByPk(id);

      if (!categoria) {
        return res.status(404).json({ error: 'Categoria nao encontrada' });
      }

      const nome = req.body?.nome != null ? String(req.body.nome).trim() : categoria.nome;
      const ativo = parseBoolean(req.body?.ativo, categoria.ativo);

      await categoria.update({
        nome: nome || categoria.nome,
        ativo
      });

      return res.json(categoria);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      const categoria = await Categoria.findByPk(id);

      if (!categoria) {
        return res.status(404).json({ error: 'Categoria nao encontrada' });
      }

      const insumosVinculados = await Insumo.count({
        where: { categoria_id: id }
      });

      if (insumosVinculados > 0) {
        await categoria.update({ ativo: false });
        return res.json({
          message: `Categoria desativada (${insumosVinculados} insumo(s) vinculado(s))`,
          softDelete: true
        });
      }

      await categoria.destroy();
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover categoria' });
    }
  }
};
