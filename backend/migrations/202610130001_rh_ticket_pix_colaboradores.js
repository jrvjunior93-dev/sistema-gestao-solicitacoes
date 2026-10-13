'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

// Somente estrutura aditiva: nenhum lote/titulo/cadastro existente e regravado.
module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    const colunas = [
      ['rh_ticket_lotes', 'forma_pagamento', { type: DataTypes.STRING(20), allowNull: true }],
      ['rh_ticket_lotes', 'request_hash', { type: DataTypes.STRING(64), allowNull: true }],
      ['rh_ticket_lote_itens', 'titulo_financeiro_id', { type: DataTypes.INTEGER, allowNull: true }]
    ];
    for (const [tabela, coluna, definicao] of colunas) {
      if (!await columnExists(sequelize, tabela, coluna)) await queryInterface.addColumn(tabela, coluna, definicao);
    }
    if (!await indexExists(sequelize, 'rh_ticket_lote_itens', 'idx_rh_ticket_item_titulo')) {
      await queryInterface.addIndex('rh_ticket_lote_itens', ['titulo_financeiro_id'], { name: 'idx_rh_ticket_item_titulo' });
    }
  },
  // Manter as colunas no rollback de codigo preserva vinculos financeiros.
  async down() {}
};
