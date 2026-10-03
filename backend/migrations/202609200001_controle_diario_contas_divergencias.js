const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

async function addColumnIfMissing(queryInterface, sequelize, tableName, columnName, definition) {
  if (await tableExists(sequelize, tableName) && !(await columnExists(sequelize, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    const tableName = 'financeiro_caixa_sessoes';
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_status', {
      type: DataTypes.STRING(20),
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_solicitada_por', {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_solicitada_em', {
      type: DataTypes.DATE,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_decidida_por', {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_decidida_em', {
      type: DataTypes.DATE,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, sequelize, tableName, 'divergencia_decisao_observacao', {
      type: DataTypes.TEXT,
      allowNull: true
    });

    if (await tableExists(sequelize, tableName) && !(await indexExists(sequelize, tableName, 'idx_fin_caixa_divergencia_status'))) {
      await queryInterface.addIndex(tableName, ['divergencia_status', 'status'], {
        name: 'idx_fin_caixa_divergencia_status'
      });
    }
  },

  async down() {
    // Migracao conservadora: preserva o historico de auditoria das divergencias.
  }
};
