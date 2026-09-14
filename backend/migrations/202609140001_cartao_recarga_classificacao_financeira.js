'use strict';

const {
  columnExists,
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

const TABELA = 'cartoes_recarga';

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, TABELA))) return;

    if (!(await columnExists(sequelize, TABELA, 'empresa_id'))) {
      await queryInterface.addColumn(TABELA, 'empresa_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }
    if (!(await columnExists(sequelize, TABELA, 'categoria_financeira_id'))) {
      await queryInterface.addColumn(TABELA, 'categoria_financeira_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }

    if (!(await foreignKeyExists(sequelize, TABELA, 'cr_cartao_empresa_fk'))) {
      await queryInterface.addConstraint(TABELA, {
        fields: ['empresa_id'],
        type: 'foreign key',
        name: 'cr_cartao_empresa_fk',
        references: { table: 'empresas_grupo', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await foreignKeyExists(sequelize, TABELA, 'cr_cartao_categoria_financeira_fk'))) {
      await queryInterface.addConstraint(TABELA, {
        fields: ['categoria_financeira_id'],
        type: 'foreign key',
        name: 'cr_cartao_categoria_financeira_fk',
        references: { table: 'categorias_financeiras', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!(await indexExists(sequelize, TABELA, 'cr_cartao_classificacao_financeira_idx'))) {
      await queryInterface.addIndex(TABELA, ['empresa_id', 'categoria_financeira_id'], {
        name: 'cr_cartao_classificacao_financeira_idx'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: a classificacao integra a auditoria financeira das recargas.
  }
};
