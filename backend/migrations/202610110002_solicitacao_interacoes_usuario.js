const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    if (await tableExists(sequelize, 'solicitacao_interacoes_usuario')) return;
    await sequelize.query(`CREATE TABLE solicitacao_interacoes_usuario (
      solicitacao_id INT NOT NULL,
      usuario_id INT NOT NULL,
      historico_id INT NOT NULL,
      tipo VARCHAR(40) NOT NULL,
      evento_em DATETIME NOT NULL,
      lido_em DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, historico_id),
      KEY idx_interacoes_pendentes (usuario_id, solicitacao_id, lido_em, evento_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  },
  async down() {
    throw new Error('Preservar as leituras por usuario. Reverter apenas o codigo; nao excluir automaticamente a tabela.');
  }
};
