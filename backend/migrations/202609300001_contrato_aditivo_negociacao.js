'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

/**
 * Vincula um anexo de contrato ao termo aditivo que o originou.
 *
 * A coluna permanece anulavel para preservar anexos e aditivos anteriores. A obrigatoriedade
 * vale para novos pedidos e e conferida no servico antes da criacao do aditivo.
 * Migration exclusivamente estrutural: nenhum registro existente e regravado.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'contrato_anexos', 'aditivo_id')) {
      await queryInterface.addColumn('contrato_anexos', 'aditivo_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'contrato_aditivos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!await indexExists(sequelize, 'contrato_anexos', 'idx_contrato_anexos_aditivo_tipo')) {
      await queryInterface.addIndex('contrato_anexos', ['aditivo_id', 'tipo'], {
        name: 'idx_contrato_anexos_aditivo_tipo'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: o documento faz parte da trilha de aprovacao do aditivo.
  }
};
