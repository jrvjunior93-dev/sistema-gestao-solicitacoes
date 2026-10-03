const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!(await tableExists(sequelize, 'obras'))) return;

    if (!(await columnExists(sequelize, 'obras', 'nivel_apropriacao_formulario'))) {
      await queryInterface.addColumn('obras', 'nivel_apropriacao_formulario', {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!(await indexExists(sequelize, 'obras', 'idx_obras_nivel_apropriacao_formulario'))) {
      await queryInterface.addIndex('obras', ['nivel_apropriacao_formulario'], {
        name: 'idx_obras_nivel_apropriacao_formulario'
      });
    }

  },

  async down() {
    // Conservadora: a configuracao passa a integrar a regra operacional da obra.
  }
};
