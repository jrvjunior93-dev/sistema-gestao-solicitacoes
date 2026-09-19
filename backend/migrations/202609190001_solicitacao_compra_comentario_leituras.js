const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    if (await tableExists(sequelize, 'solicitacao_compra_comentario_leituras')) return;

    await sequelize.query(`CREATE TABLE solicitacao_compra_comentario_leituras (
      id INT AUTO_INCREMENT PRIMARY KEY,
      solicitacao_id INT NOT NULL,
      usuario_id INT NOT NULL,
      alvo_chave VARCHAR(100) NOT NULL,
      historico_id INT NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL,
      UNIQUE KEY uq_compra_comentario_leitura (solicitacao_id, usuario_id, alvo_chave),
      INDEX idx_compra_comentario_leitura_usuario (usuario_id),
      CONSTRAINT fk_compra_comentario_leitura_solicitacao
        FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
      CONSTRAINT fk_compra_comentario_leitura_usuario
        FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }
};
