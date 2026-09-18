'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabela = 'titulos_financeiros';
    if (!(await tableExists(sequelize, tabela)) || await columnExists(sequelize, tabela, 'favorecido_pagamento_id')) return;
    await queryInterface.addColumn(tabela, 'favorecido_pagamento_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'parceiros', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  },
  async down() {
    // O favorecido integra a trilha financeira e não pode ser apagado por rollback.
  }
};
