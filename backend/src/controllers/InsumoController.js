const { Op } = require('sequelize');
const { Categoria, Insumo, Unidade } = require('../models');

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
      const { q, categoria_id } = req.query;
      const where = { ativo: true };

      if (q) {
        const termo = `%${String(q).trim()}%`;
        where[Op.or] = [
          { nome: { [Op.like]: termo } },
          { codigo: { [Op.like]: termo } },
          { descricao: { [Op.like]: termo } }
        ];
      }

      if (categoria_id) {
        where.categoria_id = categoria_id;
      }

      const insumos = await Insumo.findAll({
        where,
        include: [
          { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
          { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
        ],
        order: [['nome', 'ASC']]
      });

      return res.json(insumos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar insumos' });
    }
  },

  async create(req, res) {
    try {
      const nome = String(req.body?.nome || '').trim();
      const codigo = req.body?.codigo != null ? String(req.body.codigo).trim() : '';
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : '';
      const unidade_id = req.body?.unidade_id;
      const categoria_id = req.body?.categoria_id;

      if (!nome || !unidade_id) {
        return res.status(400).json({ error: 'Informe nome e unidade' });
      }

      const insumo = await Insumo.create({
        nome,
        codigo: codigo || null,
        descricao: descricao || null,
        unidade_id,
        categoria_id: categoria_id || null
      });

      return res.status(201).json(insumo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar insumo' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const insumo = await Insumo.findByPk(id);

      if (!insumo) {
        return res.status(404).json({ error: 'Insumo nao encontrado' });
      }

      const ativo = parseBoolean(req.body?.ativo, insumo.ativo);
      const nome = req.body?.nome != null ? String(req.body.nome).trim() : insumo.nome;
      const codigo = req.body?.codigo != null ? String(req.body.codigo).trim() : insumo.codigo;
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : insumo.descricao;

      await insumo.update({
        nome: nome || insumo.nome,
        codigo: codigo === '' ? null : codigo,
        descricao: descricao === '' ? null : descricao,
        unidade_id: req.body?.unidade_id ?? insumo.unidade_id,
        categoria_id: req.body?.categoria_id === '' ? null : (req.body?.categoria_id ?? insumo.categoria_id),
        ativo
      });

      return res.json(insumo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar insumo' });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      const insumo = await Insumo.findByPk(id);

      if (!insumo) {
        return res.status(404).json({ error: 'Insumo nao encontrado' });
      }

      await insumo.destroy();
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover insumo' });
    }
  }
};
