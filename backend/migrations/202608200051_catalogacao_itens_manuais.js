'use strict';

const {
  columnExists,
  foreignKeyExists,
  indexExists,
  tableExists
} = require('../src/database/schemaUtils');

/**
 * Catalogacao nao destrutiva dos itens manuais de Compras.
 *
 * O item manual continua sendo a fotografia da solicitacao original e preserva todas as FKs de
 * cotacao, resposta, alocacao e pedido. A catalogacao apenas o vincula a um insumo oficial.
 * Aliases permitem que a mesma descricao seja reconhecida nas importacoes futuras.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const manualTable = 'solicitacao_compra_itens_manuais';

    if (!await columnExists(sequelize, manualTable, 'insumo_catalogado_id')) {
      // Coluna e FK em DOIS passos, com nome explicito para a constraint.
      //
      // Com `references` no `addColumn`, o Sequelize gera
      // `solicitacao_compra_itens_manuais_insumo_catalogado_id_foreign_idx` — **65 caracteres**,
      // e o limite do MySQL para identificador e 64. A migration falhava com `ER_TOO_LONG_IDENT`
      // e derrubava o boot inteiro do backend (`server.js` roda as migrations antes de subir).
      //
      // O nome do resto e curto o bastante; so este estourava, porque o nome da tabela ja tem 32
      // caracteres.
      await queryInterface.addColumn(manualTable, 'insumo_catalogado_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });

    }

    if (!await foreignKeyExists(sequelize, manualTable, 'sc_itens_manuais_insumo_catalogado_fk')) {
      await queryInterface.addConstraint(manualTable, {
        fields: ['insumo_catalogado_id'],
        type: 'foreign key',
        name: 'sc_itens_manuais_insumo_catalogado_fk',
        references: { table: 'insumos', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!await columnExists(sequelize, manualTable, 'catalogado_por')) {
      await queryInterface.addColumn(manualTable, 'catalogado_por', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }

    if (!await foreignKeyExists(sequelize, manualTable, 'sc_itens_manuais_catalogador_fk')) {
      const constraints = await queryInterface.getForeignKeyReferencesForTable(manualTable);
      const jaPossuiFkCatalogador = constraints.some((entry) => entry.columnName === 'catalogado_por');
      if (!jaPossuiFkCatalogador) await queryInterface.addConstraint(manualTable, {
        fields: ['catalogado_por'],
        type: 'foreign key',
        name: 'sc_itens_manuais_catalogador_fk',
        references: { table: 'users', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!await columnExists(sequelize, manualTable, 'catalogado_em')) {
      await queryInterface.addColumn(manualTable, 'catalogado_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!await columnExists(sequelize, manualTable, 'catalogacao_tipo')) {
      await queryInterface.addColumn(manualTable, 'catalogacao_tipo', {
        type: DataTypes.STRING(20),
        allowNull: true
      });
    }

    if (!await indexExists(sequelize, manualTable, 'sc_itens_manuais_insumo_catalogado')) {
      await queryInterface.addIndex(manualTable, ['insumo_catalogado_id'], {
        name: 'sc_itens_manuais_insumo_catalogado'
      });
    }

    if (!await tableExists(sequelize, 'insumo_codigo_sequencias')) {
      await queryInterface.createTable('insumo_codigo_sequencias', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        chave: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        ultimo_numero: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    if (!await tableExists(sequelize, 'insumo_aliases')) {
      await queryInterface.createTable('insumo_aliases', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        insumo_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'insumos', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        alias: { type: DataTypes.STRING(255), allowNull: false },
        alias_normalizado: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        origem_item_manual_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: manualTable, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });

      await queryInterface.addIndex('insumo_aliases', ['insumo_id', 'ativo'], {
        name: 'insumo_aliases_insumo_ativo'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: os vinculos e aliases passam a integrar o historico de Compras.
  }
};
