const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    const tableName = 'apropriacoes';
    if (!(await tableExists(sequelize, tableName))) return;

    if (!(await columnExists(sequelize, tableName, 'macro_formulario'))) {
      await queryInterface.addColumn(tableName, 'macro_formulario', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!(await columnExists(sequelize, tableName, 'ordem_planilha'))) {
      await queryInterface.addColumn(tableName, 'ordem_planilha', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    if (!(await indexExists(sequelize, tableName, 'idx_apropriacoes_macro_formulario'))) {
      await queryInterface.addIndex(tableName, ['obra_id', 'macro_formulario', 'ativo'], {
        name: 'idx_apropriacoes_macro_formulario'
      });
    }
  },

  async down() {
    // Migracao conservadora: a selecao confirmada integra a classificacao operacional.
  }
};
