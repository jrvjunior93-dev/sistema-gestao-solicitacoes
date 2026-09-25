'use strict';

const {
  columnExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!(await columnExists(sequelize, 'rh_colaboradores', 'valor_ticket'))) {
      await queryInterface.addColumn('rh_colaboradores', 'valor_ticket', {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
      });
    }

    if (!(await tableExists(sequelize, 'rh_ticket_lotes'))) {
      await queryInterface.createTable('rh_ticket_lotes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        competencia: { type: DataTypes.STRING(7), allowNull: false },
        idempotency_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        empresa_grupo_id: { type: DataTypes.INTEGER, allowNull: false },
        parceiro_id: { type: DataTypes.INTEGER, allowNull: false },
        categoria_financeira_id: { type: DataTypes.INTEGER, allowNull: false },
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },
        valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'SOLICITADO' },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
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
    if (!(await indexExists(sequelize, 'rh_ticket_lotes', 'idx_rh_ticket_lotes_competencia_empresa'))) {
      await queryInterface.addIndex('rh_ticket_lotes', ['competencia', 'empresa_grupo_id'], {
        name: 'idx_rh_ticket_lotes_competencia_empresa'
      });
    }

    if (!(await tableExists(sequelize, 'rh_ticket_lote_itens'))) {
      await queryInterface.createTable('rh_ticket_lote_itens', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        lote_id: { type: DataTypes.INTEGER, allowNull: false },
        colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
        obra_id: { type: DataTypes.INTEGER, allowNull: false },
        valor_ticket: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
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
    if (!(await indexExists(sequelize, 'rh_ticket_lote_itens', 'uq_rh_ticket_lote_colaborador'))) {
      await queryInterface.addIndex('rh_ticket_lote_itens', ['lote_id', 'colaborador_id'], {
        name: 'uq_rh_ticket_lote_colaborador',
        unique: true
      });
    }
  },

  async down({ queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'rh_ticket_lote_itens')) {
      await queryInterface.dropTable('rh_ticket_lote_itens');
    }
    if (await tableExists(sequelize, 'rh_ticket_lotes')) {
      await queryInterface.dropTable('rh_ticket_lotes');
    }
    if (await columnExists(sequelize, 'rh_colaboradores', 'valor_ticket')) {
      await queryInterface.removeColumn('rh_colaboradores', 'valor_ticket');
    }
  }
};
