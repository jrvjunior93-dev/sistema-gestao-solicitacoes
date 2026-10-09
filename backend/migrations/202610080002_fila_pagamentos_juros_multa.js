'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const tabela of ['pagamentos_manuais_fila', 'titulos_financeiros']) {
      for (const coluna of ['juros', 'multa']) {
        if (!await columnExists(sequelize, tabela, coluna)) {
          await queryInterface.addColumn(tabela, coluna, {
            type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0
          });
        }
      }
    }
  },
  async down() { throw new Error('Preservar encargos das baixas; rollback manual revisado.'); }
};
