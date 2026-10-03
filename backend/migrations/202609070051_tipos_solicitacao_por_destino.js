'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

/**
 * Catalogo de tipos da Nova Solicitacao por Obra/Centro de Custo.
 *
 * Migration exclusivamente estrutural. Tipos existentes continuam disponiveis para todas as
 * Obras pelo default da nova coluna. Centros de Custo passam a exigir vinculo explicito, criado
 * pela tela de configuracao; nenhuma solicitacao existente e alterada.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'tipo_solicitacao', 'disponivel_para_obras')) {
      await queryInterface.addColumn('tipo_solicitacao', 'disponivel_para_obras', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    if (!await tableExists(sequelize, 'centro_custo_tipos_solicitacao')) {
      await queryInterface.createTable('centro_custo_tipos_solicitacao', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        centro_custo_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'Obras', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        tipo_solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'tipo_solicitacao', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    if (!await indexExists(sequelize, 'centro_custo_tipos_solicitacao', 'uq_centro_custo_tipo_solicitacao')) {
      await queryInterface.addIndex(
        'centro_custo_tipos_solicitacao',
        ['centro_custo_id', 'tipo_solicitacao_id'],
        { name: 'uq_centro_custo_tipo_solicitacao', unique: true }
      );
    }
    if (!await indexExists(sequelize, 'centro_custo_tipos_solicitacao', 'idx_centro_custo_tipo_ativo')) {
      await queryInterface.addIndex(
        'centro_custo_tipos_solicitacao',
        ['centro_custo_id', 'ativo'],
        { name: 'idx_centro_custo_tipo_ativo' }
      );
    }
  },

  async down() {
    // Sem rollback destrutivo: a configuracao pode representar decisoes operacionais vigentes.
  }
};
