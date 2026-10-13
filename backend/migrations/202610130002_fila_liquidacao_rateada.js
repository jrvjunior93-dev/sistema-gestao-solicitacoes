'use strict';
const { tableExists, columnExists, indexExists } = require('../src/database/schemaUtils');
// Somente estrutura aditiva. Nenhum pagamento antigo e regravado.
module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    if (!await tableExists(sequelize, 'pagamento_fila_liquidacoes')) {
      await queryInterface.createTable('pagamento_fila_liquidacoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        idempotency_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        request_hash: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false },
        dados: { type: DataTypes.JSON, allowNull: false },
        criado_por: { type: DataTypes.INTEGER, allowNull: false },
        estornado_por: { type: DataTypes.INTEGER, allowNull: true },
        estornado_em: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!await columnExists(sequelize, 'movimentos_financeiros', 'fila_liquidacao_id')) {
      await queryInterface.addColumn('movimentos_financeiros', 'fila_liquidacao_id', { type: DataTypes.INTEGER, allowNull: true });
    }
    if (!await indexExists(sequelize, 'movimentos_financeiros', 'idx_movimento_fila_liquidacao')) {
      await queryInterface.addIndex('movimentos_financeiros', ['fila_liquidacao_id'], { name: 'idx_movimento_fila_liquidacao' });
    }
  },
  async down() {} // rollback de codigo nao remove auditoria/vinculos financeiros.
};
