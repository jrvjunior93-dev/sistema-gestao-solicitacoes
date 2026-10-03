const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    if (await tableExists(sequelize, 'solicitacao_atencoes_usuario')) return;
    await sequelize.query(`
      CREATE TABLE solicitacao_atencoes_usuario (
        solicitacao_id INT NOT NULL,
        usuario_id INT NOT NULL,
        tipo VARCHAR(40) NOT NULL,
        resumo VARCHAR(255) NULL,
        evento_em DATETIME NOT NULL,
        lido_em DATETIME NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (solicitacao_id, usuario_id),
        KEY idx_solicitacao_atencoes_usuario_fila (usuario_id, lido_em, evento_em)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },

  async down({ sequelize }) {
    await sequelize.query('DROP TABLE IF EXISTS solicitacao_atencoes_usuario');
  }
};
