const { Op } = require('sequelize');
const {
  TipoSubContrato,
  TipoSolicitacao,
  Solicitacao,
  Contrato,
  sequelize
} = require('../models');

function normalizarIds(body = {}) {
  const informados = Array.isArray(body.tipo_solicitacao_ids)
    ? body.tipo_solicitacao_ids
    : [body.tipo_macro_id];
  return [...new Set(informados
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function incluirTiposSolicitacao(filtroTipoId = null) {
  return [
    { model: TipoSolicitacao, as: 'macro', attributes: ['id', 'nome'] },
    {
      model: TipoSolicitacao,
      as: 'tiposSolicitacao',
      attributes: ['id', 'nome', 'ativo'],
      through: { attributes: [] },
      ...(filtroTipoId ? { where: { id: Number(filtroTipoId) }, required: true } : {})
    }
  ];
}

function serializar(tipo) {
  const plain = typeof tipo?.get === 'function' ? tipo.get({ plain: true }) : { ...tipo };
  const tipos = Array.isArray(plain.tiposSolicitacao) ? plain.tiposSolicitacao : [];
  const ids = [...new Set([
    ...tipos.map((item) => Number(item.id)),
    Number(plain.tipo_macro_id)
  ].filter((id) => Number.isInteger(id) && id > 0))];
  return {
    ...plain,
    tipo_solicitacao_ids: ids,
    tipos_solicitacao: tipos.length ? tipos : (plain.macro ? [plain.macro] : [])
  };
}

async function buscarComVinculos(id, transaction = null) {
  return TipoSubContrato.findByPk(id, {
    include: incluirTiposSolicitacao(),
    transaction
  });
}

async function validarTipos(ids, transaction) {
  if (!ids.length) {
    throw Object.assign(new Error('Selecione ao menos um Tipo de Solicitação.'), { statusCode: 400 });
  }
  const tipos = await TipoSolicitacao.findAll({
    where: { id: { [Op.in]: ids } },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (tipos.length !== ids.length) {
    throw Object.assign(new Error('Um ou mais Tipos de Solicitação não foram encontrados.'), { statusCode: 400 });
  }
  return tipos;
}

module.exports = {
  async index(req, res) {
    try {
      const filtroTipoId = req.query?.tipo_macro_id;
      if (filtroTipoId && (!Number.isInteger(Number(filtroTipoId)) || Number(filtroTipoId) <= 0)) {
        return res.status(400).json({ error: 'Tipo de Solicitação inválido.' });
      }

      const tipos = await TipoSubContrato.findAll({
        include: incluirTiposSolicitacao(filtroTipoId),
        order: [['nome', 'ASC']]
      });
      return res.json(tipos.map(serializar));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar subtipos' });
    }
  },

  async create(req, res) {
    try {
      const nome = String(req.body?.nome || '').trim();
      const ids = normalizarIds(req.body);
      if (!nome || !ids.length) {
        return res.status(400).json({ error: 'Nome e ao menos um Tipo de Solicitação são obrigatórios.' });
      }

      const criadoId = await sequelize.transaction(async (transaction) => {
        const macros = await validarTipos(ids, transaction);
        const tipo = await TipoSubContrato.create({ nome, tipo_macro_id: ids[0] }, { transaction });
        await tipo.setTiposSolicitacao(macros, { transaction });
        return tipo.id;
      });

      return res.status(201).json(serializar(await buscarComVinculos(criadoId)));
    } catch (error) {
      console.error(error);
      return res.status(error?.statusCode || 500).json({ error: error?.message || 'Erro ao criar subtipo' });
    }
  },

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const nome = String(req.body?.nome || '').trim();
      const ids = normalizarIds(req.body);
      if (!nome || !ids.length) {
        return res.status(400).json({ error: 'Nome e ao menos um Tipo de Solicitação são obrigatórios.' });
      }

      await sequelize.transaction(async (transaction) => {
        const macros = await validarTipos(ids, transaction);
        const tipo = await TipoSubContrato.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!tipo) {
          throw Object.assign(new Error('Subtipo não encontrado.'), { statusCode: 404 });
        }
        await tipo.update({ nome, tipo_macro_id: ids[0] }, { transaction });
        await tipo.setTiposSolicitacao(macros, { transaction });
      });

      return res.json(serializar(await buscarComVinculos(id)));
    } catch (error) {
      console.error(error);
      return res.status(error?.statusCode || 500).json({ error: error?.message || 'Erro ao atualizar subtipo' });
    }
  },

  async ativar(req, res) {
    try {
      const tipo = await TipoSubContrato.findByPk(req.params.id);
      if (!tipo) return res.status(404).json({ error: 'Subtipo nao encontrado' });
      await tipo.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar subtipo' });
    }
  },

  async desativar(req, res) {
    try {
      const tipo = await TipoSubContrato.findByPk(req.params.id);
      if (!tipo) return res.status(404).json({ error: 'Subtipo nao encontrado' });
      await tipo.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar subtipo' });
    }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;
      const tipo = await TipoSubContrato.findByPk(id);
      if (!tipo) return res.status(404).json({ error: 'Subtipo nao encontrado' });

      const [totalSolicitacoes, totalContratos] = await Promise.all([
        Solicitacao.count({ where: { tipo_sub_id: id } }),
        Contrato.count({ where: { tipo_sub_id: id } })
      ]);

      await tipo.update({ ativo: false });
      return res.json({
        message: 'Subtipo excluido da visualizacao operacional.',
        softDelete: true,
        vinculos: { solicitacoes: totalSolicitacoes, contratos: totalContratos }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir subtipo' });
    }
  }
};
