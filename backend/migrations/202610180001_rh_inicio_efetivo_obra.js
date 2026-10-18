'use strict';
const { columnExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    if (!await columnExists(sequelize, 'rh_colaboradores', 'data_inicio_efetivo_obra')) {
      await queryInterface.addColumn('rh_colaboradores', 'data_inicio_efetivo_obra', {
        type: DataTypes.DATEONLY, allowNull: true,
        comment: 'Inicio efetivo informado; nao altera admissao, vinculos ou calculos.'
      });
    }
  },
  async down() { throw Error('Preserve datas informadas: rollback estrutural exige revisao explicita.'); }
};
