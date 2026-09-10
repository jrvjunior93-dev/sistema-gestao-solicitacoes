'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

/**
 * Preserva no titulo o favorecido PIX escolhido durante sua criacao.
 *
 * Migration apenas estrutural: titulos existentes continuam sem favorecido preferencial e
 * mantem o comportamento legado de usar o favorecido ativo mais recente do credor.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const table = 'titulos_financeiros';
    const column = 'payment_beneficiary_id';

    if (!await columnExists(sequelize, table, column)) {
      await queryInterface.addColumn(table, column, {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'payment_beneficiaries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!await indexExists(sequelize, table, 'idx_titulos_payment_beneficiary')) {
      await queryInterface.addIndex(table, [column], {
        name: 'idx_titulos_payment_beneficiary'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: o vinculo escolhido compoe a trilha do pagamento.
  }
};
