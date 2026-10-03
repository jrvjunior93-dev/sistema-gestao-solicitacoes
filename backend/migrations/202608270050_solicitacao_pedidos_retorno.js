'use strict';

const {
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * Pedido explicito para devolver uma solicitacao ao setor de quem precisa interagir nela.
 *
 * Os setores sao fotografados como texto porque o pedido precisa continuar auditavel mesmo se o
 * cadastro do setor mudar. As FKs recebem nomes curtos e explicitos: o MySQL limita identificadores
 * a 64 caracteres, e nomes automaticos nesta tabela ultrapassariam esse limite.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabela = 'solicitacao_pedidos_retorno';

    if (!(await tableExists(sequelize, tabela))) {
      await queryInterface.createTable(tabela, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
        solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
        setor_solicitante: { type: DataTypes.STRING(80), allowNull: false },
        setor_atual_pedido: { type: DataTypes.STRING(80), allowNull: false },
        motivo: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
        decidido_por: { type: DataTypes.INTEGER, allowNull: true },
        decidido_em: { type: DataTypes.DATE, allowNull: true },
        motivo_decisao: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await foreignKeyExists(sequelize, tabela, 'spr_solicitacao_fk'))) {
      await queryInterface.addConstraint(tabela, {
        fields: ['solicitacao_id'],
        type: 'foreign key',
        name: 'spr_solicitacao_fk',
        references: { table: 'solicitacoes', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });
    }

    if (!(await foreignKeyExists(sequelize, tabela, 'spr_solicitado_por_fk'))) {
      await queryInterface.addConstraint(tabela, {
        fields: ['solicitado_por'],
        type: 'foreign key',
        name: 'spr_solicitado_por_fk',
        references: { table: 'users', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    }

    if (!(await foreignKeyExists(sequelize, tabela, 'spr_decidido_por_fk'))) {
      await queryInterface.addConstraint(tabela, {
        fields: ['decidido_por'],
        type: 'foreign key',
        name: 'spr_decidido_por_fk',
        references: { table: 'users', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    }

    const indices = [
      ['spr_solicitacao_status', ['solicitacao_id', 'status']],
      ['spr_setor_atual_status', ['setor_atual_pedido', 'status']],
      ['spr_solicitante_status', ['solicitado_por', 'status']]
    ];
    for (const [name, fields] of indices) {
      if (!(await indexExists(sequelize, tabela, name))) {
        await queryInterface.addIndex(tabela, fields, { name });
      }
    }
  },

  async down() {
    // Sem rollback destrutivo: pedidos e decisoes de retorno compoem a auditoria da solicitacao.
  }
};
