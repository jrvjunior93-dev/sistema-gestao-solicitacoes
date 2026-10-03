'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!(await tableExists(sequelize, 'solicitacao_centro_custo_distribuicoes'))) {
      await queryInterface.createTable('solicitacao_centro_custo_distribuicoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
        centro_custo_id: { type: DataTypes.INTEGER, allowNull: false },
        obra_id: { type: DataTypes.INTEGER, allowNull: true },
        abrangencia: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OBRA' },
        criterio: { type: DataTypes.STRING(20), allowNull: false },
        percentual: { type: DataTypes.DECIMAL(9, 6), allowNull: false },
        valor_distribuido: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    if (!(await indexExists(sequelize, 'solicitacao_centro_custo_distribuicoes', 'uq_solicitacao_cc_distribuicao_obra'))) {
      await queryInterface.addIndex('solicitacao_centro_custo_distribuicoes', ['solicitacao_id', 'obra_id'], {
        name: 'uq_solicitacao_cc_distribuicao_obra',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, 'solicitacao_centro_custo_distribuicoes', 'idx_solicitacao_cc_distribuicao_centro_data'))) {
      await queryInterface.addIndex('solicitacao_centro_custo_distribuicoes', ['centro_custo_id', 'createdAt'], {
        name: 'idx_solicitacao_cc_distribuicao_centro_data'
      });
    }
    if (!(await indexExists(sequelize, 'solicitacao_centro_custo_distribuicoes', 'idx_solicitacao_cc_distribuicao_obra_data'))) {
      await queryInterface.addIndex('solicitacao_centro_custo_distribuicoes', ['obra_id', 'createdAt'], {
        name: 'idx_solicitacao_cc_distribuicao_obra_data'
      });
    }
  },

  async down({ queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'solicitacao_centro_custo_distribuicoes')) {
      await queryInterface.dropTable('solicitacao_centro_custo_distribuicoes');
    }
  }
};
