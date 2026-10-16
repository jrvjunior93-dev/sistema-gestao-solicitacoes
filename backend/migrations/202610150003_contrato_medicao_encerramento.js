'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!await columnExists(sequelize, 'contratos', 'medicao_encerramento')) {
      await queryInterface.addColumn('contratos', 'medicao_encerramento', { type: DataTypes.JSON, allowNull: true });
    }
  },
  async down() { throw Error('Preserve a marcacao/auditoria; rollback estrutural exige revisao explicita.'); }
};
