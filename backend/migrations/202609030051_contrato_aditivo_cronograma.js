'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Cronograma financeiro negociado no termo aditivo.
 *
 * A vigencia define ate quando o servico sera executado; os vencimentos podem continuar depois.
 * O JSON guarda a fotografia das parcelas aprovadas pelo usuario sem alterar registros antigos.
 * Migration exclusivamente estrutural: nenhum contrato ou aditivo existente e regravado.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'contrato_aditivos', 'cronograma_parcelas')) {
      await queryInterface.addColumn('contrato_aditivos', 'cronograma_parcelas', {
        type: DataTypes.JSON,
        allowNull: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
