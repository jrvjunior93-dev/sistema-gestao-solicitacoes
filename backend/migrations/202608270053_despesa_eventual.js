'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'solicitacoes', 'despesa_eventual_declaracoes')) {
      await queryInterface.addColumn('solicitacoes', 'despesa_eventual_declaracoes', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    if (!await indexExists(sequelize, 'solicitacoes', 'sol_desp_eventual_saldo_idx')) {
      await queryInterface.addIndex(
        'solicitacoes',
        ['tipo_solicitacao_id', 'obra_id', 'cancelada', 'status_global'],
        { name: 'sol_desp_eventual_saldo_idx' }
      );
    }

    // O tipo DESPESA_EVENTUAL, seu comportamento e seus subtipos sao cadastros
    // funcionais. Devem ser configurados pela interface depois do deploy.
  },

  async down() {
    // Sem rollback destrutivo: solicitacoes podem referenciar o tipo, os subtipos e as declaracoes.
  }
};
