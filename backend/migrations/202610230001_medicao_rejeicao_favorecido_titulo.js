'use strict';
const { resolveTableName, columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    for (const [names, column] of [[['contrato_medicoes'], 'rejeicao'], [['titulos_financeiros'], 'pagamento_favorecido']]) {
      const table = await resolveTableName(sequelize, names);
      if (!await columnExists(sequelize, table, column)) {
        await queryInterface.addColumn(table, column, { type: DataTypes.JSON, allowNull: true });
      }
    }
  },
  async down() { throw new Error('Reversao automatica bloqueada: preservar rejeicoes e instrucoes de pagamento.'); }
};
