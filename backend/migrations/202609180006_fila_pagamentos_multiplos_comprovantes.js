'use strict';

const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'pagamentos_manuais_fila_comprovantes')) return;
    await queryInterface.createTable('pagamentos_manuais_fila_comprovantes', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      fila_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'pagamentos_manuais_fila', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      url: { type: DataTypes.TEXT, allowNull: false },
      hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      banco: { type: DataTypes.STRING(40), allowNull: true },
      tipo: { type: DataTypes.STRING(40), allowNull: true },
      identificador: { type: DataTypes.STRING(160), allowNull: true },
      dados_json: { type: DataTypes.JSON, allowNull: true },
      vinculado_por: { type: DataTypes.INTEGER, allowNull: true },
      vinculado_em: { type: DataTypes.DATE, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  },
  async down() {
    // Comprovantes de pagamento são documentos de auditoria e não podem ser removidos por rollback.
  }
};
