const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ sequelize }) {
    const [columns] = await sequelize.query("SHOW COLUMNS FROM pedido_compras LIKE 'entrega_controle_obrigatorio'");
    if (!columns.length) await sequelize.query('ALTER TABLE pedido_compras ADD entrega_controle_obrigatorio TINYINT(1) NOT NULL DEFAULT 0');
    if (!(await tableExists(sequelize, 'pedido_compra_entregas'))) await sequelize.query(`
      CREATE TABLE pedido_compra_entregas (
        pedido_compra_item_id INT NOT NULL PRIMARY KEY,
        pedido_compra_id INT NOT NULL,
        previsao DATE NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'OBRA',
        prazo_compras DATE NULL,
        saldo_cancelado DECIMAL(14,3) NOT NULL DEFAULT 0,
        versao INT NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_entrega_fila (estado, previsao, prazo_compras),
        KEY idx_entrega_pedido (pedido_compra_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    if (!(await tableExists(sequelize, 'pedido_compra_entrega_operacoes'))) await sequelize.query(`
      CREATE TABLE pedido_compra_entrega_operacoes (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        chave VARCHAR(120) NOT NULL,
        pedido_compra_id INT NOT NULL,
        usuario_id INT NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        resultado JSON NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_entrega_operacao (chave),
        KEY idx_entrega_operacao_pedido (pedido_compra_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
  async down() { throw new Error('Rollback de entregas exige backup e procedimento supervisionado; historico deve ser preservado.'); }
};
