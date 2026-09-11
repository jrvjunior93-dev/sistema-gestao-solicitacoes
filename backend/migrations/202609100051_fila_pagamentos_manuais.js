const { tableExists } = require('../src/database/schemaUtils');

const ACTIVE_STATUSES = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'];
const INTEGER_COLUMN_TYPE = /^(?:tinyint|smallint|mediumint|int|integer|bigint)(?:\(\d+\))?(?: unsigned)?$/i;

async function referenceIdType(sequelize, tableName) {
  const [rows] = await sequelize.query(`
    SELECT COLUMN_TYPE AS columnType
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = 'id'
     LIMIT 1
  `, { replacements: { tableName } });

  const columnType = String(rows?.[0]?.columnType || '').trim();
  if (!INTEGER_COLUMN_TYPE.test(columnType)) {
    throw new Error(
      `Nao foi possivel criar a fila de pagamentos: ${tableName}.id ` +
      `usa um tipo de chave incompativel (${columnType || 'nao encontrado'}).`
    );
  }

  return columnType;
}

module.exports = {
  async up({ sequelize }) {
    if (await tableExists(sequelize, 'pagamentos_manuais_fila')) return;

    // Bancos legados podem ter IDs INT assinados ou UNSIGNED. No MySQL, a
    // coluna da FK precisa repetir exatamente o tipo da chave referenciada.
    const [tituloIdType, contaIdType, movimentoIdType, userIdType] = await Promise.all([
      referenceIdType(sequelize, 'titulos_financeiros'),
      referenceIdType(sequelize, 'contas_bancarias'),
      referenceIdType(sequelize, 'movimentos_financeiros'),
      referenceIdType(sequelize, 'users')
    ]);

    await sequelize.query(`
      CREATE TABLE pagamentos_manuais_fila (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        titulo_financeiro_id ${tituloIdType} NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
        valor_previsto DECIMAL(14,2) NOT NULL,
        valor_informado DECIMAL(14,2) NULL,
        data_vencimento_prevista DATE NULL,
        data_baixa DATE NULL,
        conta_bancaria_id ${contaIdType} NULL,
        movimento_financeiro_id ${movimentoIdType} NULL,
        motivo TEXT NULL,
        selecionado_por ${userIdType} NULL,
        selecionado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processado_por ${userIdType} NULL,
        processado_em DATETIME NULL,
        resolvido_por ${userIdType} NULL,
        resolvido_em DATETIME NULL,
        idempotency_key VARCHAR(120) NULL,
        active_titulo_key ${tituloIdType} GENERATED ALWAYS AS (
          CASE
            WHEN status IN (${ACTIVE_STATUSES.map((status) => `'${status}'`).join(', ')})
            THEN titulo_financeiro_id
            ELSE NULL
          END
        ) STORED,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_pagamentos_manuais_fila_titulo FOREIGN KEY (titulo_financeiro_id) REFERENCES titulos_financeiros(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_pagamentos_manuais_fila_conta FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_pagamentos_manuais_fila_movimento FOREIGN KEY (movimento_financeiro_id) REFERENCES movimentos_financeiros(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_pagamentos_manuais_fila_selecionado_por FOREIGN KEY (selecionado_por) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_pagamentos_manuais_fila_processado_por FOREIGN KEY (processado_por) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_pagamentos_manuais_fila_resolvido_por FOREIGN KEY (resolvido_por) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        UNIQUE KEY uq_pagamentos_manuais_fila_ativo (active_titulo_key),
        UNIQUE KEY uq_pagamentos_manuais_fila_idempotency (idempotency_key),
        KEY idx_pagamentos_manuais_fila_titulo (titulo_financeiro_id),
        KEY idx_pagamentos_manuais_fila_status (status),
        KEY idx_pagamentos_manuais_fila_selecionado_em (selecionado_em),
        KEY idx_pagamentos_manuais_fila_conta (conta_bancaria_id),
        KEY idx_pagamentos_manuais_fila_movimento (movimento_financeiro_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },

  async down() {
    // Migration estrutural protegida: rollback destrutivo deve ser executado manualmente.
  }
};
