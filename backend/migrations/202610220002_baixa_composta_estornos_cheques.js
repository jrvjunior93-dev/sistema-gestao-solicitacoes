'use strict';
const { resolveTableName, columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ sequelize, queryInterface, DataTypes }) {
    const tabela = await resolveTableName(sequelize, ['baixas_financeiras_grupos']);
    if (!await columnExists(sequelize, tabela, 'estornos_cheques')) {
      await queryInterface.addColumn(tabela, 'estornos_cheques', { type: DataTypes.JSON, allowNull: true });
    }
  },
  async down() { throw Error('Reversao automatica bloqueada: preserva recibos e historico de devolucoes.'); }
};
