SET @coluna_existe := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'pode_criar_solicitacao_compra'
);

SET @sql := IF(
  @coluna_existe = 0,
  'ALTER TABLE users ADD COLUMN pode_criar_solicitacao_compra BOOLEAN NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE users
SET pode_criar_solicitacao_compra = 1
WHERE perfil IN ('SUPERADMIN', 'ADMIN');
