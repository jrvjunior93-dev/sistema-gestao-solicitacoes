const { Sequelize } = require('sequelize');
const fs = require('fs');
const { env } = require('../config/env');
const { recordDatabaseQuery } = require('../observability/comprasPerformance');

const comprasPerformanceDatabaseOptions = env.comprasPerformanceEnabled
  ? {
      benchmark: true,
      logging: recordDatabaseQuery
    }
  : {
      logging: false
    };

const sequelize = new Sequelize(
  env.dbName,
  env.dbUser,
  env.dbPassword,
  {
    host: env.dbHost,
    port: env.dbPort,
    dialect: 'mysql',
    ...(env.dbSslCaFile ? {
      dialectOptions: {
        ssl: {
          ca: fs.readFileSync(env.dbSslCaFile),
          rejectUnauthorized: true
        }
      }
    } : {}),
    ...comprasPerformanceDatabaseOptions,
  }
);

module.exports = sequelize;
