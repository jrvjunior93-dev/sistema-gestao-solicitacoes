const { Apropriacao, Obra } = require('../models');

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
      const { obra_id } = req.query;
      const where = { ativo: true };

      if (obra_id) {
        where.obra_id = obra_id;
      }

      const apropriacoes = await Apropriacao.findAll({
        where,
        order: [['codigo', 'ASC']]
      });

      return res.json(apropriacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar apropriacoes' });
    }
  },

  async create(req, res) {
    try {
      const obra_id = req.body?.obra_id;
      const codigo = String(req.body?.codigo || '').trim();
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : '';

      if (!obra_id || !codigo) {
        return res.status(400).json({ error: 'Informe obra e codigo' });
      }

      const obra = await Obra.findByPk(obra_id);
      if (!obra) {
        return res.status(400).json({ error: 'Obra nao encontrada' });
      }

      const apropriacao = await Apropriacao.create({
        obra_id,
        codigo,
        descricao: descricao || null
      });

      return res.status(201).json(apropriacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar apropriacao' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const apropriacao = await Apropriacao.findByPk(id);

      if (!apropriacao) {
        return res.status(404).json({ error: 'Apropriacao nao encontrada' });
      }

      const codigo = req.body?.codigo != null ? String(req.body.codigo).trim() : apropriacao.codigo;
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : apropriacao.descricao;
      const ativo = parseBoolean(req.body?.ativo, apropriacao.ativo);

      await apropriacao.update({
        codigo: codigo || apropriacao.codigo,
        descricao: descricao === '' ? null : descricao,
        ativo
      });

      return res.json(apropriacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar apropriacao' });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      const apropriacao = await Apropriacao.findByPk(id);

      if (!apropriacao) {
        return res.status(404).json({ error: 'Apropriacao nao encontrada' });
      }

      await apropriacao.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover apropriacao' });
    }
  }
};
