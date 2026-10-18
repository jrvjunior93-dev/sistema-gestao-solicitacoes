'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!await columnExists(sequelize, 'titulos_financeiros', 'bloqueio_pagamento_proprietario')) {
      await queryInterface.addColumn('titulos_financeiros', 'bloqueio_pagamento_proprietario', {
        type: DataTypes.JSON, allowNull: true,
        comment: 'Rejeicao do saldo pelo proprietario; somente nova autorizacao pode liberar.'
      });
    }
  },
  async down() { throw Error('Bloqueios financeiros ativos exigem revisao explicita antes de remover a coluna.'); }
};
