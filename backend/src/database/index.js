const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || '',
  process.env.DB_USER || '',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
    dialect: 'mysql',
    logging: false,
  }
);

module.exports = sequelize;
