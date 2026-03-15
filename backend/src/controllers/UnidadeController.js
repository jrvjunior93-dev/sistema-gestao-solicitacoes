const { Insumo, Unidade } = require('../models');

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
      const unidades = await Unidade.findAll({
        where: { ativo: true },
        order: [['nome', 'ASC']]
      });

      return res.json(unidades);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar unidades' });
    }
  },

  async create(req, res) {
    try {
      const nome = String(req.body?.nome || '').trim();
      const sigla = String(req.body?.sigla || '').trim();

      if (!nome || !sigla) {
        return res.status(400).json({ error: 'Informe nome e sigla' });
      }

      const unidade = await Unidade.create({ nome, sigla });
      return res.status(201).json(unidade);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar unidade' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const unidade = await Unidade.findByPk(id);

      if (!unidade) {
        return res.status(404).json({ error: 'Unidade nao encontrada' });
      }

      const nome = req.body?.nome != null ? String(req.body.nome).trim() : unidade.nome;
      const sigla = req.body?.sigla != null ? String(req.body.sigla).trim() : unidade.sigla;
      const ativo = parseBoolean(req.body?.ativo, unidade.ativo);

      await unidade.update({
        nome: nome || unidade.nome,
        sigla: sigla || unidade.sigla,
        ativo
      });

      return res.json(unidade);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar unidade' });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      const unidade = await Unidade.findByPk(id);

      if (!unidade) {
        return res.status(404).json({ error: 'Unidade nao encontrada' });
      }

      const insumosVinculados = await Insumo.count({
        where: { unidade_id: id }
      });

      if (insumosVinculados > 0) {
        await unidade.update({ ativo: false });
        return res.json({
          message: `Unidade desativada (${insumosVinculados} insumo(s) vinculado(s))`,
          softDelete: true
        });
      }

      await unidade.destroy();
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover unidade' });
    }
  }
};
