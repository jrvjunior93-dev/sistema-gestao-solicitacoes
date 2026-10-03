'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Fotografia da qualificacao do representante legal informada na abertura do contrato.
 *
 * O cadastro do parceiro pode mudar depois; o contrato precisa preservar os dados que foram
 * apresentados ao Juridico naquele momento. A coluna e anulavel para manter os contratos antigos
 * validos. A regra de obrigatoriedade para novos contratos acima do limite fica no servico.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'representante_legal_qualificacao')) return;

    await queryInterface.addColumn('contratos', 'representante_legal_qualificacao', {
      type: DataTypes.JSON,
      allowNull: true
    });
  },

  async down() {
    // Sem rollback destrutivo: a qualificacao integra o dossie juridico do contrato.
  }
};
