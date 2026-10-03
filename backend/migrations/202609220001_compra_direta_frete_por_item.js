'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabelaCompra = 'solicitacao_compras';
    if (await tableExists(sequelize, tabelaCompra)
      && !(await columnExists(sequelize, tabelaCompra, 'frete_modo'))) {
      await queryInterface.addColumn(tabelaCompra, 'frete_modo', {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'GLOBAL'
      });
    }

    for (const tabelaItens of ['solicitacao_compra_itens', 'solicitacao_compra_itens_manuais']) {
      if (await tableExists(sequelize, tabelaItens)
        && !(await columnExists(sequelize, tabelaItens, 'frete_valor'))) {
        await queryInterface.addColumn(tabelaItens, 'frete_valor', {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
          defaultValue: 0
        });
      }
    }
  },

  async down() {
    // O modo e os valores individuais integram a trilha financeira da compra direta.
  }
};
