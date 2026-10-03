'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

/**
 * Categoria financeira do contrato de obra (fluxo novo).
 *
 * Necessaria para que o titulo gerado na aprovacao nasca com categoria — sem ela o titulo
 * cai na pendencia TITULOS_SEM_CATEGORIA e o custo nao se classifica na DRE.
 *
 * Nullable de proposito: os 335 contratos legados nao tem categoria e continuam validos.
 * A obrigatoriedade vale apenas na criacao pelo fluxo novo, verificada no servico.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'contratos'))) return;
    if (await columnExists(sequelize, 'contratos', 'categoria_financeira_id')) return;

    await queryInterface.addColumn('contratos', 'categoria_financeira_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      after: 'forma_pagamento_id'
    });
  },

  async down() {
    // Sem rollback destrutivo: a categoria e parte do contrato.
  }
};
