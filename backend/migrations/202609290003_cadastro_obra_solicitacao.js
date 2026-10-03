'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

const TABLE = 'solicitacao_cadastro_obra_usuarios';

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!(await tableExists(sequelize, TABLE))) {
      await queryInterface.createTable(TABLE, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'solicitacoes', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        usuario_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        criado_por: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
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

    if (!(await indexExists(sequelize, TABLE, 'uq_solicitacao_cadastro_obra_usuario'))) {
      await queryInterface.addIndex(TABLE, ['solicitacao_id', 'usuario_id'], {
        name: 'uq_solicitacao_cadastro_obra_usuario',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, TABLE, 'idx_solicitacao_cadastro_obra_usuario'))) {
      await queryInterface.addIndex(TABLE, ['usuario_id'], {
        name: 'idx_solicitacao_cadastro_obra_usuario'
      });
    }
  },

  async down({ queryInterface, sequelize }) {
    if (await tableExists(sequelize, TABLE)) {
      await queryInterface.dropTable(TABLE);
    }
  }
};
