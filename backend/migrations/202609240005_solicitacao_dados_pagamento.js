'use strict';

const { columnExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'solicitacoes', 'dados_pagamento')) {
      await queryInterface.addColumn('solicitacoes', 'dados_pagamento', {
        type: DataTypes.TEXT,
        allowNull: true,
        after: 'favorecido_chave_pix'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: o campo pode conter instruções necessárias a pagamentos futuros.
  }
};
