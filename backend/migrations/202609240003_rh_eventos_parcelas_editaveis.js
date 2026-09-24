const { columnExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!(await columnExists(sequelize, 'rh_eventos_recorrentes', 'parcelas_valores_json'))) {
      await queryInterface.addColumn('rh_eventos_recorrentes', 'parcelas_valores_json', {
        type: DataTypes.JSON,
        allowNull: true,
        after: 'parcelas_total'
      });
    }
  }
};
