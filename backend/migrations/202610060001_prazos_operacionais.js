const { tableExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ sequelize }) {
    if (!(await tableExists(sequelize, 'obrigacoes_operacionais'))) await sequelize.query(`CREATE TABLE obrigacoes_operacionais (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(160) NOT NULL,
      tipo VARCHAR(50) NOT NULL, setor VARCHAR(50) NOT NULL, obra_id INT NOT NULL,
      solicitacao_id INT NULL, pedido_id INT NULL, referencia_id INT NULL,
      inicio_em DATETIME NOT NULL, prazo_em DATETIME NOT NULL, limite_em DATETIME NOT NULL,
      regra_snapshot JSON NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
      encerrada_em DATETIME NULL, usuario_id INT NULL, motivo VARCHAR(2000) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_obrigacao_chave (chave), KEY idx_obrigacao_obra (obra_id, setor, status, limite_em),
      KEY idx_obrigacao_solicitacao (solicitacao_id, status), KEY idx_obrigacao_referencia (tipo, referencia_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    if (!(await tableExists(sequelize, 'obrigacoes_operacionais_liberacoes'))) await sequelize.query(`CREATE TABLE obrigacoes_operacionais_liberacoes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(100) NOT NULL,
      obra_id INT NOT NULL, setor VARCHAR(50) NOT NULL, ate DATETIME NOT NULL,
      usuario_id INT NOT NULL, motivo VARCHAR(2000) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_liberacao_chave (chave), KEY idx_liberacao_obra (obra_id, setor, ate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Somente estrutura. A configuração ausente é lida como desligada;
    // sua primeira gravação ocorre exclusivamente ao salvar pela tela.
  },
  async down() { throw new Error('Prazos operacionais preservam histórico. Rollback exige procedimento supervisionado.'); }
};
