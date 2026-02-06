const { EtapaSetor, Setor } = require('../models');
const { Op } = require('sequelize');

module.exports = {
  async index(req, res) {
    try {
      const { setor } = req.query;
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const where = {};
      if (setor && perfil !== 'SUPERADMIN') {
        const setorRow = await Setor.findOne({
          where: {
            [Op.or]: [
              { codigo: setor },
              { nome: setor }
            ]
          },
          attributes: ['codigo', 'nome']
        });
        const tokens = [setor];
        if (setorRow?.codigo) tokens.push(setorRow.codigo);
        if (setorRow?.nome) tokens.push(setorRow.nome);
        where.setor = { [Op.in]: tokens };
      }

      const itens = await EtapaSetor.findAll({
        where,
        order: [['ordem', 'ASC']]
      });

      return res.json(itens);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar status por setor' });
    }
  },

  async create(req, res) {
    try {
      const { setor, nome, ordem } = req.body;
      if (!setor || !nome || ordem === undefined) {
        return res.status(400).json({
          error: 'setor, nome e ordem sao obrigatorios'
        });
      }

      const item = await EtapaSetor.create({
        setor,
        nome,
        ordem
      });

      return res.status(201).json(item);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar status do setor' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nome, ordem } = req.body;

      const item = await EtapaSetor.findByPk(id);
      if (!item) {
        return res.status(404).json({ error: 'Status nao encontrado' });
      }

      await item.update({
        nome: nome ?? item.nome,
        ordem: ordem ?? item.ordem
      });

      return res.json(item);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar status do setor' });
    }
  },

  async ativar(req, res) {
    try {
      const { id } = req.params;
      const item = await EtapaSetor.findByPk(id);
      if (!item) {
        return res.status(404).json({ error: 'Status nao encontrado' });
      }
      await item.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar status' });
    }
  },

  async desativar(req, res) {
    try {
      const { id } = req.params;
      const item = await EtapaSetor.findByPk(id);
      if (!item) {
        return res.status(404).json({ error: 'Status nao encontrado' });
      }
      await item.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar status' });
    }
  }
};
