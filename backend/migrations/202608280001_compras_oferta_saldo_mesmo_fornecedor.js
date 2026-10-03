const { columnExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await columnExists(sequelize, 'solicitacao_compra_resposta_itens', 'escopo_disponibilidade'))) {
      await queryInterface.addColumn('solicitacao_compra_resposta_itens', 'escopo_disponibilidade', {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ACUMULADA',
        after: 'quantidade_disponivel'
      });
    }
  },

  async down() {
    // Migration aditiva: rollback destrutivo somente de forma assistida.
  }
};
