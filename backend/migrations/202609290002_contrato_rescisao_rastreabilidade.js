'use strict';

const { columnExists } = require('../src/database/schemaUtils');

const TABLE = 'contratos';

// Migration deliberadamente estrutural. Nao existe UPDATE/backfill: contratos legados sao
// classificados pela consulta usando os dados atuais de cada ambiente.
const COLUMNS = {
  rescindido_em: DataTypes => ({ type: DataTypes.DATE, allowNull: true }),
  rescindido_por: DataTypes => ({ type: DataTypes.INTEGER, allowNull: true }),
  motivo_rescisao: DataTypes => ({ type: DataTypes.TEXT, allowNull: true }),
  saldo_rescindido: DataTypes => ({ type: DataTypes.DECIMAL(14, 2), allowNull: true })
};

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const [name, build] of Object.entries(COLUMNS)) {
      if (!(await columnExists(sequelize, TABLE, name))) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn(TABLE, name, build(DataTypes));
      }
    }
  },

  async down({ queryInterface, sequelize }) {
    for (const name of Object.keys(COLUMNS).reverse()) {
      if (await columnExists(sequelize, TABLE, name)) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn(TABLE, name);
      }
    }
  }
};
