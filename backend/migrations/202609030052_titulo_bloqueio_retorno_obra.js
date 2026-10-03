'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

/**
 * Bloqueio auditavel dos titulos vinculados a uma solicitacao cujo retorno foi pedido pela OBRA
 * enquanto ela estava no FINANCEIRO.
 *
 * Migration exclusivamente estrutural: nenhum titulo existente e alterado.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabela = 'titulos_financeiros';

    if (!await columnExists(sequelize, tabela, 'bloqueado_retorno_obra')) {
      await queryInterface.addColumn(tabela, 'bloqueado_retorno_obra', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!await columnExists(sequelize, tabela, 'bloqueio_retorno_pedido_id')) {
      await queryInterface.addColumn(tabela, 'bloqueio_retorno_pedido_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, tabela, 'bloqueio_retorno_motivo')) {
      await queryInterface.addColumn(tabela, 'bloqueio_retorno_motivo', {
        type: DataTypes.STRING(255),
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, tabela, 'bloqueio_retorno_em')) {
      await queryInterface.addColumn(tabela, 'bloqueio_retorno_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!await indexExists(sequelize, tabela, 'tf_bloqueio_retorno_obra_idx')) {
      await queryInterface.addIndex(
        tabela,
        ['bloqueado_retorno_obra', 'bloqueio_retorno_pedido_id'],
        { name: 'tf_bloqueio_retorno_obra_idx' }
      );
    }
  },

  async down() {
    // Sem rollback destrutivo: o bloqueio compoe a trilha operacional dos titulos.
  }
};
