'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

async function addColumnIfMissing(queryInterface, sequelize, table, column, definition) {
  if (!(await columnExists(sequelize, table, column))) {
    await queryInterface.addColumn(table, column, definition);
  }
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'cheques_terceiros'))) return;

    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'movimento_deposito_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'movimentos_financeiros', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'conciliacao_deposito_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'conciliacoes_bancarias', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'movimento_devolucao_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'movimentos_financeiros', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'conciliacao_devolucao_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'conciliacoes_bancarias', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'data_deposito', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'data_compensacao', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'data_devolucao', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, 'cheques_terceiros', 'deposito_idempotency_key', {
      type: DataTypes.STRING(160),
      allowNull: true
    });
    if (!(await indexExists(sequelize, 'cheques_terceiros', 'ux_cheques_deposito_idempotency'))) {
      await queryInterface.addIndex('cheques_terceiros', ['deposito_idempotency_key'], {
        name: 'ux_cheques_deposito_idempotency',
        unique: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: os campos preservam a trilha financeira do cheque.
  }
};
