'use strict';
const { resolveTableName, columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    const tabela = await resolveTableName(sequelize, ['titulos_financeiros', 'TitulosFinanceiros']);
    if (!await columnExists(sequelize, tabela, 'pagamento_negociacao')) {
      await queryInterface.addColumn(tabela, 'pagamento_negociacao', { type: DataTypes.JSON, allowNull: true });
    }
  },
  async down() { throw new Error('Reversao automatica bloqueada para preservar as instrucoes de pagamento.'); }
};
