'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `justificativa`: por que a contratacao esta sendo feita (escopo 3.1/3.2, campo obrigatorio).
 *
 * Nao reaproveita `objeto` nem `descricao`: objeto e O QUE se contrata, descricao/titulo e como
 * o contrato e identificado, e justificativa e POR QUE — os tres aparecem juntos na lista do
 * cliente, entao sao tres campos.
 *
 * Nulo nos contratos existentes: nao ha como inventar a justificativa de contrato ja assinado.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'justificativa')) return;

    await queryInterface.addColumn('contratos', 'justificativa', {
      type: DataTypes.TEXT,
      allowNull: true
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
