const { tableExists } = require('../src/database/schemaUtils');

const ACTIVE_STATUSES = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'];

module.exports = {
  async up({ sequelize }) {
    if (await tableExists(sequelize, 'pagamentos_manuais_fila')) return;

    await sequelize.query(`
      CREATE TABLE pagamentos_manuais_fila (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        titulo_financeiro_id INT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
        valor_previsto DECIMAL(14,2) NOT NULL,
        valor_informado DECIMAL(14,2) NULL,
        data_vencimento_prevista DATE NULL,
        data_baixa DATE NULL,
        conta_bancaria_id INT NULL,
        movimento_financeiro_id INT NULL,
        motivo TEXT NULL,
        selecionado_por INT NULL,
        selecionado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processado_por INT NULL,
        processado_em DATETIME NULL,
        resolvido_por INT NULL,
        resolvido_em DATETIME NULL,
        idempotency_key VARCHAR(120) NULL,
        active_titulo_key INT GENERATED ALWAYS AS (
          CASE
            WHEN status IN (${ACTIVE_STATUSES.map((status) => `'${status}'`).join(', ')})
            THEN titulo_financeiro_id
            ELSE NULL
          END
        ) STORED,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_pagamentos_manuais_fila_titulo FOREIGN KEY (titulo_financeiro_id) REFERENCES titulos_financeiros(id) ON DELETE RESTRICT ON UPDATE CASCADE,
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
      )
    `);
  },

  async down() {
    // Migration estrutural protegida: rollback destrutivo deve ser executado manualmente.
  }
};
