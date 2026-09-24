const {
  columnExists,
  indexExists,
  resolveTableName,
  tableExists
} = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    const tableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');
    if (!(await tableExists(sequelize, tableName))) return;

    if (!(await columnExists(sequelize, tableName, 'nivel_apropriacao_formulario'))) {
      await queryInterface.addColumn(tableName, 'nivel_apropriacao_formulario', {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!(await indexExists(sequelize, tableName, 'idx_obras_nivel_apropriacao_formulario'))) {
      await queryInterface.addIndex(tableName, ['nivel_apropriacao_formulario'], {
        name: 'idx_obras_nivel_apropriacao_formulario'
      });
    }
  },

  async down() {
    // Conservadora: a coluna integra a configuracao operacional das obras.
  }
};
