const { Op } = require('sequelize');
const { TipoSolicitacao, TipoSubContrato, TipoSubContratoTipoSolicitacao, Solicitacao, Contrato } = require('../models');
const {
  enrichTipoSolicitacao,
  normalizeTipoSolicitacaoCodigo,
  serializeTipoSolicitacaoBehavior
} = require('../services/tipoSolicitacaoBehaviorService');
const { garantirTiposAutomaticosCentroCusto } = require('../services/tipoSolicitacaoDisponibilidadeService');

module.exports = {
  async index(req, res) {
    try {
      await garantirTiposAutomaticosCentroCusto();
      const tipos = await TipoSolicitacao.findAll({
        order: [['nome', 'ASC']]
      });
      return res.json(tipos.map(enrichTipoSolicitacao));
    } catch (error) {
      console.error('Erro ao listar tipos:', error);
      return res.status(500).json({ error: 'Erro ao listar tipos de solicitacao' });
    }
  },

  async create(req, res) {
    const nome = String(req.body?.nome || '').trim();
    const codigoInterno = normalizeTipoSolicitacaoCodigo(req.body?.codigo_interno, nome);

    if (!nome) {
      return res.status(400).json({ error: 'Nome e obrigatorio' });
    }

    const existente = await TipoSolicitacao.findOne({
      where: {
        [Op.or]: [
          { nome },
          ...(codigoInterno ? [{ codigo_interno: codigoInterno }] : [])
        ]
      },
      attributes: ['id']
    });
    if (existente) {
      return res.status(409).json({ error: 'Ja existe tipo com mesmo nome ou codigo interno' });
    }

    const tipo = await TipoSolicitacao.create({
      nome,
      codigo_interno: codigoInterno || null,
      disponivel_para_obras: req.body?.disponivel_para_obras !== false,
      comportamento: serializeTipoSolicitacaoBehavior(req.body?.comportamento || null)
    });
    return res.status(201).json(enrichTipoSolicitacao(tipo));
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const nome = String(req.body?.nome || '').trim();
      const codigoInterno = normalizeTipoSolicitacaoCodigo(req.body?.codigo_interno, nome);

      if (!nome) {
        return res.status(400).json({ error: 'Nome e obrigatorio' });
      }

      const tipo = await TipoSolicitacao.findByPk(id);
      if (!tipo) {
        return res.status(404).json({ error: 'Tipo nao encontrado' });
      }

      const existente = await TipoSolicitacao.findOne({
        where: {
          id: { [Op.ne]: id },
          [Op.or]: [
            { nome },
            ...(codigoInterno ? [{ codigo_interno: codigoInterno }] : [])
          ]
        },
        attributes: ['id']
      });
      if (existente) {
        return res.status(409).json({ error: 'Ja existe tipo com mesmo nome ou codigo interno' });
      }

      await tipo.update({
        nome,
        codigo_interno: codigoInterno || null,
        disponivel_para_obras: req.body?.disponivel_para_obras !== undefined
          ? req.body.disponivel_para_obras === true
          : tipo.disponivel_para_obras,
        comportamento: req.body?.comportamento !== undefined
          ? serializeTipoSolicitacaoBehavior(req.body?.comportamento)
          : tipo.comportamento
      });
      return res.json(enrichTipoSolicitacao(tipo));
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
        TipoSubContratoTipoSolicitacao.count({ where: { tipo_solicitacao_id: id } }),
        Solicitacao.count({ where: { tipo_solicitacao_id: id } }),
        Contrato.count({ where: { tipo_macro_id: id } })
      ]);

      await tipo.update({ ativo: false });
      return res.json({
        message: 'Tipo de solicitacao excluido da visualizacao operacional.',
        softDelete: true,
        vinculos: {
          subtipos: totalSubtipos,
          solicitacoes: totalSolicitacoes,
          contratos: totalContratos
        }
      });
    } catch (error) {
      console.error('Erro ao excluir tipo:', error);
      return res.status(500).json({ error: 'Erro ao excluir tipo' });
    }
  }
};
