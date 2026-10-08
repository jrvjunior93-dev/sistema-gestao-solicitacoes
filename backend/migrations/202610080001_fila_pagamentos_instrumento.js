'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'pagamentos_manuais_fila', 'instrumento_pagamento_json')) {
      await queryInterface.addColumn('pagamentos_manuais_fila', 'instrumento_pagamento_json', {
        type: DataTypes.JSON, allowNull: true
      });
    }
    // Somente estrutura; nao cria ou modifica titulos, pagamentos ou autorizacoes.
    if (!await columnExists(sequelize, 'pagamento_autorizacao_lotes', 'revisao_autorizacao')) {
      await queryInterface.addColumn('pagamento_autorizacao_lotes', 'revisao_autorizacao', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0
      });
    }
  },
  async down() { throw new Error('Preservar instrumentos e auditoria das baixas; rollback manual revisado.'); }
};
