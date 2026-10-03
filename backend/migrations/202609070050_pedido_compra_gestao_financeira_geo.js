'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

/**
 * Gestao financeira do pedido pelo GEO.
 *
 * Migration exclusivamente estrutural: pedidos e titulos legados nao sao alterados. Registros
 * antigos permanecem com `financeiro_fluxo_versao = NULL` e sao classificados em leitura ate
 * que o GEO adote expressamente o novo fluxo.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const pedidos = 'pedido_compras';

    if (!await columnExists(sequelize, pedidos, 'financeiro_fluxo_versao')) {
      await queryInterface.addColumn(pedidos, 'financeiro_fluxo_versao', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, pedidos, 'status_financeiro')) {
      await queryInterface.addColumn(pedidos, 'status_financeiro', {
        type: DataTypes.STRING(40),
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, pedidos, 'financeiro_encaminhado_em')) {
      await queryInterface.addColumn(pedidos, 'financeiro_encaminhado_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
    if (!await columnExists(sequelize, pedidos, 'financeiro_atualizado_em')) {
      await queryInterface.addColumn(pedidos, 'financeiro_atualizado_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
    if (!await indexExists(sequelize, pedidos, 'idx_pedido_compra_status_financeiro')) {
      await queryInterface.addIndex(pedidos, ['status_financeiro', 'financeiro_fluxo_versao'], {
        name: 'idx_pedido_compra_status_financeiro'
      });
    }

    if (!await tableExists(sequelize, 'pedido_compra_titulos')) {
      await queryInterface.createTable('pedido_compra_titulos', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        pedido_compra_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'pedido_compras', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        titulo_financeiro_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'titulos_financeiros', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        numero_parcela: { type: DataTypes.INTEGER, allowNull: true },
        total_parcelas: { type: DataTypes.INTEGER, allowNull: true },
        valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },
        status_liberacao: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PREVISAO' },
        origem: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NOVO_FLUXO' },
        idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        liberado_por: { type: DataTypes.INTEGER, allowNull: true },
        liberado_em: { type: DataTypes.DATE, allowNull: true },
        cancelado_por: { type: DataTypes.INTEGER, allowNull: true },
        cancelado_em: { type: DataTypes.DATE, allowNull: true },
        motivo_cancelamento: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex('pedido_compra_titulos', ['pedido_compra_id', 'titulo_financeiro_id'], {
        name: 'uq_pedido_compra_titulo',
        unique: true
      });
      await queryInterface.addIndex('pedido_compra_titulos', ['pedido_compra_id', 'status_liberacao'], {
        name: 'idx_pedido_compra_titulos_status'
      });
      await queryInterface.addIndex('pedido_compra_titulos', ['idempotency_key'], {
        name: 'uq_pedido_compra_titulos_idempotency',
        unique: true
      });
    }

    if (!await tableExists(sequelize, 'pedido_compra_reaberturas')) {
      await queryInterface.createTable('pedido_compra_reaberturas', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        pedido_compra_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'pedido_compras', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
        motivo: { type: DataTypes.TEXT, allowNull: false },
        status_pedido_snapshot: { type: DataTypes.STRING(40), allowNull: false },
        status_financeiro_snapshot: { type: DataTypes.STRING(40), allowNull: true },
        financeiro_snapshot: { type: DataTypes.JSON, allowNull: true },
        solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
        solicitado_em: { type: DataTypes.DATE, allowNull: false },
        decidido_por: { type: DataTypes.INTEGER, allowNull: true },
        decidido_em: { type: DataTypes.DATE, allowNull: true },
        motivo_decisao: { type: DataTypes.TEXT, allowNull: true },
        idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex('pedido_compra_reaberturas', ['pedido_compra_id', 'status'], {
        name: 'idx_pedido_compra_reaberturas_status'
      });
      await queryInterface.addIndex('pedido_compra_reaberturas', ['idempotency_key'], {
        name: 'uq_pedido_compra_reabertura_idempotency',
        unique: true
      });
    }

    if (!await tableExists(sequelize, 'pedido_compra_documentos_financeiros')) {
      await queryInterface.createTable('pedido_compra_documentos_financeiros', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        pedido_compra_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'pedido_compras', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        tipo: { type: DataTypes.STRING(30), allowNull: false },
        numero_documento: { type: DataTypes.STRING(120), allowNull: true },
        arquivo_url: { type: DataTypes.TEXT, allowNull: true },
        arquivo_nome: { type: DataTypes.STRING(255), allowNull: true },
        observacoes: { type: DataTypes.TEXT, allowNull: true },
        idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex('pedido_compra_documentos_financeiros', ['pedido_compra_id', 'tipo'], {
        name: 'idx_pedido_compra_documentos_tipo'
      });
      await queryInterface.addIndex('pedido_compra_documentos_financeiros', ['idempotency_key'], {
        name: 'uq_pedido_compra_documentos_idempotency',
        unique: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: vinculos e decisoes compoem a trilha financeira do pedido.
  }
};
