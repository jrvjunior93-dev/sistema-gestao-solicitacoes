'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const colaboradores = await queryInterface.describeTable('rh_colaboradores');
      if (!colaboradores.valor_ticket) {
        await queryInterface.addColumn('rh_colaboradores', 'valor_ticket', {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: true
        }, { transaction });
      }

      await queryInterface.createTable('rh_ticket_lotes', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        competencia: { type: Sequelize.STRING(7), allowNull: false },
        idempotency_key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        empresa_grupo_id: { type: Sequelize.INTEGER, allowNull: false },
        parceiro_id: { type: Sequelize.INTEGER, allowNull: false },
        categoria_financeira_id: { type: Sequelize.INTEGER, allowNull: false },
        solicitacao_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        titulo_financeiro_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        data_vencimento: { type: Sequelize.DATEONLY, allowNull: false },
        valor_total: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
        status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'SOLICITADO' },
        criado_por: { type: Sequelize.INTEGER, allowNull: true },
        atualizado_por: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { transaction });
      await queryInterface.addIndex('rh_ticket_lotes', ['competencia', 'empresa_grupo_id'], {
        name: 'idx_rh_ticket_lotes_competencia_empresa', transaction
      });

      await queryInterface.createTable('rh_ticket_lote_itens', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        lote_id: { type: Sequelize.INTEGER, allowNull: false },
        colaborador_id: { type: Sequelize.INTEGER, allowNull: false },
        obra_id: { type: Sequelize.INTEGER, allowNull: false },
        valor_ticket: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { transaction });
      await queryInterface.addIndex('rh_ticket_lote_itens', ['lote_id', 'colaborador_id'], {
        name: 'uq_rh_ticket_lote_colaborador', unique: true, transaction
      });

      const [tipos] = await queryInterface.sequelize.query(
        "SELECT id FROM tipo_solicitacao WHERE codigo_interno = 'TICKET_COLABORADORES' LIMIT 1",
        { transaction }
      );
      if (!tipos.length) {
        await queryInterface.bulkInsert('tipo_solicitacao', [{ 
          nome: 'TICKET DE COLABORADORES',
          codigo_interno: 'TICKET_COLABORADORES',
          comportamento: JSON.stringify({ somente_sistema: true, fluxo: 'RH_DP_TICKET' }),
          disponivel_para_obras: false,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }], { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        "DELETE FROM tipo_solicitacao WHERE codigo_interno = 'TICKET_COLABORADORES'",
        { transaction }
      );
      await queryInterface.dropTable('rh_ticket_lote_itens', { transaction });
      await queryInterface.dropTable('rh_ticket_lotes', { transaction });
      const colaboradores = await queryInterface.describeTable('rh_colaboradores');
      if (colaboradores.valor_ticket) {
        await queryInterface.removeColumn('rh_colaboradores', 'valor_ticket', { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
