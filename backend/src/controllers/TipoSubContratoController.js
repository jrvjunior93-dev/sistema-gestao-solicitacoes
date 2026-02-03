const { TipoSubContrato, TipoSolicitacao } = require('../models');

module.exports = {
  async index(req, res) {
    try {
      const { tipo_macro_id } = req.query;
      const where = {};
      if (tipo_macro_id) where.tipo_macro_id = tipo_macro_id;

      const tipos = await TipoSubContrato.findAll({
        where,
        include: [
          { model: TipoSolicitacao, as: 'macro', attributes: ['id', 'nome'] }
        ],
        order: [['nome', 'ASC']]
      });

      return res.json(tipos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar subtipos' });
    }
  },

  async create(req, res) {
    try {
      const { nome, tipo_macro_id } = req.body;
      if (!nome || !tipo_macro_id) {
        return res.status(400).json({
          error: 'Nome e tipo macro sÃ£o obrigatÃ³rios'
        });
      }
      const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
      if (!macro) {
        return res.status(400).json({ error: 'Tipo macro nao encontrado' });
      }
      const tipo = await TipoSubContrato.create({ nome, tipo_macro_id });
      return res.status(201).json(tipo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar subtipo' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome, tipo_macro_id } = req.body;
      if (!nome || !tipo_macro_id) {
        return res.status(400).json({ error: 'Nome e tipo macro sao obrigatorios' });
      }
      const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
      if (!macro) {
        return res.status(400).json({ error: 'Tipo macro nao encontrado' });
      }
      const tipo = await TipoSubContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nao encontrado' });
      await tipo.update({ nome, tipo_macro_id });
      return res.json(tipo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar subtipo' });
    }
  },

  async ativar(req, res) {
    try {
      const { id } = req.params;
      const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
      if (!macro) {
        return res.status(400).json({ error: 'Tipo macro nao encontrado' });
      }
      const tipo = await TipoSubContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nÃ£o encontrado' });
      await tipo.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar subtipo' });
    }
  },

  async desativar(req, res) {
    try {
      const { id } = req.params;
      const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
      if (!macro) {
        return res.status(400).json({ error: 'Tipo macro nao encontrado' });
      }
      const tipo = await TipoSubContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Tipo nÃ£o encontrado' });
      await tipo.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar subtipo' });
    }
  }
};
