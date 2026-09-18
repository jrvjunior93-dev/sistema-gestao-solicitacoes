const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    if (!(await tableExists(sequelize, 'rh_solicitacao_leituras'))) {
      await sequelize.query(`CREATE TABLE rh_solicitacao_leituras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitacao_id INT NOT NULL, usuario_id INT NOT NULL,
        historico_id INT NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
        UNIQUE KEY uq_rh_leitura_usuario (solicitacao_id, usuario_id),
        INDEX idx_rh_leitura_usuario (usuario_id),
        CONSTRAINT fk_rh_leitura_solicitacao FOREIGN KEY (solicitacao_id) REFERENCES rh_solicitacoes(id)
      ) ENGINE=InnoDB`);
    }
  }
};
