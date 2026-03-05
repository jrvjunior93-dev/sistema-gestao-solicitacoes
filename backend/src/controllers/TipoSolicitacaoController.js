const { TipoSolicitacao, TipoSubContrato, Solicitacao, Contrato } = require('../models');

module.exports = {
  async index(req, res) {
    const tipos = await TipoSolicitacao.findAll({
      order: [['nome', 'ASC']]
    });
    return res.json(tipos);
  },

  async create(req, res) {
    const { nome } = req.body;

    const tipo = await TipoSolicitacao.create({ nome });
    return res.status(201).json(tipo);
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome } = req.body;

      if (!nome) {
        return res.status(400).json({ error: 'Nome e obrigatorio' });
      }

      const tipo = await TipoSolicitacao.findByPk(id);
      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      await tipo.update({ nome });
      return res.json(tipo);
    } catch (error) {
      console.error('Erro ao atualizar tipo:', error);
      return res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }
  },

  async ativar(req, res) {
    try {
      const tipo = await TipoSolicitacao.findByPk(req.params.id);
      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      await tipo.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao ativar tipo:', error);
      return res.status(500).json({ error: 'Erro ao ativar tipo' });
    }
  },

  async desativar(req, res) {
    try {
      const tipo = await TipoSolicitacao.findByPk(req.params.id);
      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      await tipo.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao desativar tipo:', error);
      return res.status(500).json({ error: 'Erro ao desativar tipo' });
    }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;
      const tipo = await TipoSolicitacao.findByPk(id);

      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      const [totalSubtipos, totalSolicitacoes, totalContratos] = await Promise.all([
        TipoSubContrato.count({ where: { tipo_macro_id: id } }),
        Solicitacao.count({ where: { tipo_solicitacao_id: id } }),
        Contrato.count({ where: { tipo_macro_id: id } })
      ]);

      if (totalSubtipos > 0 || totalSolicitacoes > 0 || totalContratos > 0) {
        return res.status(409).json({
          error: 'Nao e possivel excluir tipo com subtipos, solicitacoes ou contratos vinculados.'
        });
      }

      await tipo.destroy();
      return res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao excluir tipo:', error);
      return res.status(500).json({ error: 'Erro ao excluir tipo' });
    }
  }
};
