'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'unidades_comerciais'))) return;

    if (!(await columnExists(sequelize, 'unidades_comerciais', 'excluido_em'))) {
      await queryInterface.addColumn('unidades_comerciais', 'excluido_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!(await columnExists(sequelize, 'unidades_comerciais', 'excluido_por'))) {
      await queryInterface.addColumn('unidades_comerciais', 'excluido_por', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!(await columnExists(sequelize, 'unidades_comerciais', 'motivo_exclusao'))) {
      await queryInterface.addColumn('unidades_comerciais', 'motivo_exclusao', {
        type: DataTypes.STRING(500),
        allowNull: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: os campos preservam o historico da exclusao logica.
  }
};
