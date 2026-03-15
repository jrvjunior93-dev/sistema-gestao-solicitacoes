SET @schema_name = DATABASE();

SET @has_principal_column = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'solicitacao_compras'
    AND COLUMN_NAME = 'solicitacao_principal_id'
);

SET @sql = IF(
  @has_principal_column = 0,
  'ALTER TABLE solicitacao_compras ADD COLUMN solicitacao_principal_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS solicitacao_compra_itens_manuais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  solicitacao_compra_id INT NOT NULL,
  apropriacao_id INT NOT NULL,
  nome_manual VARCHAR(255) NOT NULL,
  unidade_sigla_manual VARCHAR(50) NOT NULL,
  quantidade DECIMAL(12,2) NOT NULL,
  especificacao TEXT NOT NULL,
  necessario_para DATE NULL,
  link_produto VARCHAR(500) NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_solicitacao_compra_itens_manuais_solicitacao
    FOREIGN KEY (solicitacao_compra_id) REFERENCES solicitacao_compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_solicitacao_compra_itens_manuais_apropriacao
    FOREIGN KEY (apropriacao_id) REFERENCES apropriacoes(id)
);
