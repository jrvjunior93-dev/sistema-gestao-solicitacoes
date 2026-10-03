'use strict';

const { columnExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'movimentos_financeiros', 'comprovante_url')) {
      await queryInterface.addColumn('movimentos_financeiros', 'comprovante_url', {
        type: DataTypes.TEXT,
        allowNull: true,
        after: 'documento_referencia'
      });
    }
    if (!await columnExists(sequelize, 'movimentos_financeiros', 'comprovante_nome')) {
      await queryInterface.addColumn('movimentos_financeiros', 'comprovante_nome', {
        type: DataTypes.STRING(255),
        allowNull: true,
        after: 'comprovante_url'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: os comprovantes preservam a trilha financeira.
  }
};
