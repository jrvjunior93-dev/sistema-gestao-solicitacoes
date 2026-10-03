const { Op } = require('sequelize');
const {
  Categoria,
  Insumo,
  InsumoAlias,
  Unidade,
  SolicitacaoCompra,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraRespostaItem
} = require('../models');
const { getUserObraScopeIds } = require('../services/authorizationService');
const { gerarCodigoInsumo, normalizarNomeInsumo } = require('../services/insumoManualCatalogacaoService');

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
      const limiteInformado = Number.parseInt(req.query.limit, 10);
      const limite = Number.isInteger(limiteInformado) && limiteInformado > 0
        ? Math.min(limiteInformado, 300)
        : undefined;
      const where = { ativo: true };

      if (q) {
        const termo = `%${String(q).trim()}%`;
        const termoNormalizado = `%${normalizarNomeInsumo(q)}%`;
        const aliases = await InsumoAlias.findAll({
          where: { alias_normalizado: { [Op.like]: termoNormalizado }, ativo: true },
          attributes: ['insumo_id']
        });
        const aliasIds = aliases.map((entry) => Number(entry.insumo_id)).filter(Boolean);
        where[Op.or] = [
          { nome: { [Op.like]: termo } },
          { codigo: { [Op.like]: termo } },
          { descricao: { [Op.like]: termo } },
          ...(aliasIds.length ? [{ id: { [Op.in]: aliasIds } }] : [])
        ];
      }

      if (categoria_id) {
        where.categoria_id = categoria_id;
      }

      const insumos = await Insumo.findAll({
        where,
        include: [
          { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
          { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] },
          { model: InsumoAlias, as: 'aliases', where: { ativo: true }, required: false, attributes: ['id', 'alias'] }
        ],
        order: [['nome', 'ASC']],
        ...(limite ? { limit: limite } : {})
      });

      return res.json(insumos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar insumos' });
    }
  },

  async create(req, res) {
    const transaction = await Insumo.sequelize.transaction();
    try {
      const nome = String(req.body?.nome || '').trim();
      const codigo = req.body?.codigo != null ? String(req.body.codigo).trim() : '';
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : '';
      const unidade_id = req.body?.unidade_id;
      const unidade_manual = req.body?.unidade_manual != null ? String(req.body.unidade_manual).trim() : '';
      const categoria_id = req.body?.categoria_id;

      if (!nome) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe o nome' });
      }

      const insumo = await Insumo.create({
        nome,
        codigo: codigo || await gerarCodigoInsumo(transaction),
        descricao: descricao || null,
        unidade_id: unidade_id || null,
        unidade_manual: unidade_manual || null,
        categoria_id: categoria_id || null
      }, { transaction });

      await transaction.commit();
      return res.status(201).json(insumo);
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      console.error(error);
      if (error?.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ error: 'Ja existe um insumo com este codigo.' });
      }
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
      const unidade_manual = req.body?.unidade_manual != null ? String(req.body.unidade_manual).trim() : insumo.unidade_manual;

      await insumo.update({
        nome: nome || insumo.nome,
        codigo: codigo === '' ? null : codigo,
        descricao: descricao === '' ? null : descricao,
        unidade_id: req.body?.unidade_id ?? insumo.unidade_id,
        unidade_manual: unidade_manual === '' ? null : unidade_manual,
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

      await insumo.update({ ativo: false });
      return res.json({
        message: 'Insumo excluido da visualizacao operacional.',
        softDelete: true
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover insumo' });
    }
  },

  async ultimoPreco(req, res) {
    try {
      const insumoId = Number(req.params?.id);
      if (!insumoId) return res.status(400).json({ error: 'ID de insumo invalido' });

      const obraIdsEscopo = await getUserObraScopeIds(req.user);

      const whereCompra = { status: { [Op.in]: ['ENCERRADO', 'FECHAMENTO_PARCIAL'] } };
      if (Array.isArray(obraIdsEscopo)) {
        if (obraIdsEscopo.length === 0) {
          return res.json({ last_purchase_price: null });
        }
        whereCompra.obra_id = { [Op.in]: obraIdsEscopo };
      }

      const respostaWhere = { vencedor: true, preco: { [Op.not]: null }, deleted_at: null };
      const [respostaCadastrada, respostaManual] = await Promise.all([
        SolicitacaoCompraRespostaItem.findOne({
          where: respostaWhere,
          include: [{
            model: SolicitacaoCompraItem,
            as: 'itemCadastrado',
            required: true,
            where: { insumo_id: insumoId },
            include: [{
              model: SolicitacaoCompra,
              as: 'solicitacao',
              required: true,
              where: whereCompra,
              attributes: ['id', 'updatedAt']
            }]
          }],
          order: [[
            { model: SolicitacaoCompraItem, as: 'itemCadastrado' },
            { model: SolicitacaoCompra, as: 'solicitacao' },
            'updatedAt', 'DESC'
          ]],
          limit: 1
        }),
        SolicitacaoCompraRespostaItem.findOne({
          where: respostaWhere,
          include: [{
            model: SolicitacaoCompraItemManual,
            as: 'itemManual',
            required: true,
            where: { insumo_catalogado_id: insumoId },
            include: [{
              model: SolicitacaoCompra,
              as: 'solicitacao',
              required: true,
              where: whereCompra,
              attributes: ['id', 'updatedAt']
            }]
          }],
          order: [[
            { model: SolicitacaoCompraItemManual, as: 'itemManual' },
            { model: SolicitacaoCompra, as: 'solicitacao' },
            'updatedAt', 'DESC'
          ]],
          limit: 1
        })
      ]);

      const candidatos = [
        respostaCadastrada && {
          preco: Number(respostaCadastrada.preco),
          updatedAt: respostaCadastrada.itemCadastrado?.solicitacao?.updatedAt
        },
        respostaManual && {
          preco: Number(respostaManual.preco),
          updatedAt: respostaManual.itemManual?.solicitacao?.updatedAt
        }
      ].filter(Boolean).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

      const preco = candidatos.length ? candidatos[0].preco : null;
      return res.json({ last_purchase_price: preco });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar ultimo preco do insumo' });
    }
  },

  async importarEmMassa(req, res) {
    try {
      const { insumos, unidade_id, categoria_id } = req.body;

      if (!Array.isArray(insumos) || insumos.length === 0) {
        return res.status(400).json({ error: 'Informe lista de insumos' });
      }

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const categoriaId = categoria_id ? Number(categoria_id) : null;

      const insumosProcessados = [];
      const erros = [];

      for (let i = 0; i < insumos.length; i++) {
        const nome = String(insumos[i] || '').trim();

        if (!nome) {
          erros.push(`Linha ${i + 1}: Nome vazio`);
          continue;
        }

        try {
          const transaction = await Insumo.sequelize.transaction();
          let insumo;
          try {
            insumo = await Insumo.create({
              nome,
              codigo: await gerarCodigoInsumo(transaction),
              descricao: null,
              unidade_id: unidadeId,
              categoria_id: categoriaId
            }, { transaction });
            await transaction.commit();
          } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            throw error;
          }
          insumosProcessados.push(insumo);
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            erros.push(`Linha ${i + 1}: Insumo "${nome}" já existe`);
          } else {
            erros.push(`Linha ${i + 1}: Erro ao criar insumo`);
          }
        }
      }

      return res.status(201).json({
        sucesso: insumosProcessados.length,
        total: insumos.length,
        insumos: insumosProcessados,
        erros: erros.length > 0 ? erros : undefined
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao importar insumos em massa' });
    }
  }
};
