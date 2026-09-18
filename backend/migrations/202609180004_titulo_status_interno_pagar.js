const { columnExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    if (!(await columnExists(sequelize, 'titulos_financeiros', 'status_interno_pagar'))) {
      await sequelize.query('ALTER TABLE titulos_financeiros ADD COLUMN status_interno_pagar VARCHAR(80) NULL');
    }
  }
};
