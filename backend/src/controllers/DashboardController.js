const { Solicitacao, Sequelize } = require('../models');
const { Op } = Sequelize;

module.exports = {
  async executivo(req, res) {
    try {
      /**
       * 🔹 TOTAL GERAL
       */
      const total = await Solicitacao.count({
        where: { cancelada: false }
      });

      /**
       * 🔹 POR STATUS
       */
      const porStatus = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        where: { cancelada: false },
        group: ['status_global']
      });

      /**
       * 🔹 POR ÁREA
       */
      const porArea = await Solicitacao.findAll({
        attributes: [
          'area_responsavel',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        where: { cancelada: false },
        group: ['area_responsavel']
      });

      /**
       * 🔹 VALOR TOTAL POR STATUS
       */
      const valoresPorStatus = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [Sequelize.fn('SUM', Sequelize.col('valor')), 'valor_total']
        ],
        where: {
          cancelada: false,
          valor: { [Op.not]: null }
        },
        group: ['status_global']
      });

      /**
       * 🔹 SLA MÉDIO (em dias)
       * Diferença entre createdAt e updatedAt
       */
      const slaMedio = await Solicitacao.findAll({
        attributes: [
          'status_global',
          [
            Sequelize.fn(
              'AVG',
              Sequelize.literal('DATEDIFF(updatedAt, createdAt)')
            ),
            'sla_dias'
          ]
        ],
        where: { cancelada: false },
        group: ['status_global']
      });

      return res.json({
        total,
        porStatus,
        porArea,
        valoresPorStatus,
        slaMedio
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao carregar dashboard executivo'
      });
    }
  }
};
