const { tableExists } = require('../src/database/schemaUtils');

async function columnExists(sequelize, table, column) {
  const [rows] = await sequelize.query(`
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column LIMIT 1
  `, { replacements: { table, column } });
  return rows.length > 0;
}

module.exports = {
  async up({ sequelize }) {
    for (const table of ['solicitacao_compra_itens', 'solicitacao_compra_itens_manuais']) {
      if (!(await columnExists(sequelize, table, 'status_aprovacao'))) {
        await sequelize.query(`ALTER TABLE ${table} ADD COLUMN status_aprovacao VARCHAR(20) NULL`);
      }
    }
    if (!(await tableExists(sequelize, 'pedido_compra_item_recebimentos'))) {
      await sequelize.query(`
        CREATE TABLE pedido_compra_item_recebimentos (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          pedido_compra_item_id INT NOT NULL,
          quantidade DECIMAL(14,3) NOT NULL,
          recebido_em DATETIME NOT NULL,
          usuario_id INT NOT NULL,
          observacao TEXT NULL,
          idempotency_key VARCHAR(120) NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_pedido_item_recebimento_idempotency (idempotency_key),
          KEY idx_pedido_item_recebimento_item (pedido_compra_item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  },

  async down({ sequelize }) {
    await sequelize.query('DROP TABLE IF EXISTS pedido_compra_item_recebimentos');
    for (const table of ['solicitacao_compra_itens', 'solicitacao_compra_itens_manuais']) {
      if (await columnExists(sequelize, table, 'status_aprovacao')) {
        await sequelize.query(`ALTER TABLE ${table} DROP COLUMN status_aprovacao`);
      }
    }
  }
};
