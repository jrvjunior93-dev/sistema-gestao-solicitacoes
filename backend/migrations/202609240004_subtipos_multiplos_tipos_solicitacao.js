'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

/**
 * Permite reutilizar um subtipo em mais de um Tipo de Solicitação.
 *
 * `tipos_sub_contrato.tipo_macro_id` permanece como referência principal de compatibilidade.
 * Todos os vínculos existentes são copiados para a nova associação, sem alterar solicitações,
 * contratos ou configurações já gravadas.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabela = 'tipos_sub_contrato_tipos_solicitacao';
    if (!await tableExists(sequelize, tabela)) {
      await queryInterface.createTable(tabela, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        tipo_sub_contrato_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'tipos_sub_contrato', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        tipo_solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'tipo_solicitacao', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    if (!await indexExists(sequelize, tabela, 'uq_subtipo_tipo_solicitacao')) {
      await queryInterface.addIndex(tabela, ['tipo_sub_contrato_id', 'tipo_solicitacao_id'], {
        name: 'uq_subtipo_tipo_solicitacao',
        unique: true
      });
    }
    if (!await indexExists(sequelize, tabela, 'idx_subtipo_tipo_solicitacao_tipo')) {
      await queryInterface.addIndex(tabela, ['tipo_solicitacao_id'], {
        name: 'idx_subtipo_tipo_solicitacao_tipo'
      });
    }

    await sequelize.query(`
      INSERT IGNORE INTO ${tabela}
        (tipo_sub_contrato_id, tipo_solicitacao_id, createdAt, updatedAt)
      SELECT id, tipo_macro_id, COALESCE(createdAt, NOW()), COALESCE(updatedAt, NOW())
        FROM tipos_sub_contrato
       WHERE tipo_macro_id IS NOT NULL
    `);
  },

  async down() {
    // Sem rollback destrutivo: os vínculos adicionais podem estar em uso por solicitações.
  }
};
