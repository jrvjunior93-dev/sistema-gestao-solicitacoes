'use strict';

const { columnExists, foreignKeyExists } = require('../src/database/schemaUtils');

function queryOnConnection(connection, sql, values = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

async function addForeignKeysPreservingLegacyDates(sequelize, pendingConstraints) {
  if (pendingConstraints.length === 0) return;

  const connection = await sequelize.connectionManager.getConnection({ type: 'WRITE' });
  let originalSqlMode = null;

  try {
    const rows = await queryOnConnection(connection, 'SELECT @@SESSION.sql_mode AS sql_mode');
    originalSqlMode = String(rows?.[0]?.sql_mode || '');
    const compatibleSqlMode = originalSqlMode
      .split(',')
      .filter((mode) => !['STRICT_TRANS_TABLES', 'NO_ZERO_IN_DATE', 'NO_ZERO_DATE'].includes(mode))
      .join(',');

    await queryOnConnection(connection, 'SET SESSION sql_mode = ?', [compatibleSqlMode]);
    for (const constraintSql of pendingConstraints) {
      await queryOnConnection(connection, constraintSql);
    }
  } finally {
    if (originalSqlMode !== null) {
      await queryOnConnection(connection, 'SET SESSION sql_mode = ?', [originalSqlMode]);
    }
    await sequelize.connectionManager.releaseConnection(connection);
  }
}

/**
 * Campos reutilizaveis da Nova Solicitacao, iniciando por ADM Local de Obra.
 *
 * As colunas sao anulaveis para nao impor dados novos as solicitacoes legadas. A obrigatoriedade
 * continua sendo decidida por area/tipo/subtipo em `NOVA_SOLICITACAO_CAMPOS_POR_TIPO`.
 *
 * As FKs usam nomes curtos e explicitos: migrations rodam antes de o backend abrir a porta, e um
 * identificador gerado acima do limite do MySQL derrubaria o ambiente compartilhado.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'solicitacoes', 'justificativa')) {
      await queryInterface.addColumn('solicitacoes', 'justificativa', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    if (!await columnExists(sequelize, 'solicitacoes', 'favorecido_id')) {
      await queryInterface.addColumn('solicitacoes', 'favorecido_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }

    if (!await columnExists(sequelize, 'solicitacoes', 'forma_pagamento_id')) {
      await queryInterface.addColumn('solicitacoes', 'forma_pagamento_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }

    const pendingConstraints = [];
    if (!await foreignKeyExists(sequelize, 'solicitacoes', 'sol_favorecido_fk')) {
      pendingConstraints.push(
        'ALTER TABLE `solicitacoes` ADD CONSTRAINT `sol_favorecido_fk` '
        + 'FOREIGN KEY (`favorecido_id`) REFERENCES `parceiros` (`id`) '
        + 'ON UPDATE CASCADE ON DELETE SET NULL'
      );
    }
    if (!await foreignKeyExists(sequelize, 'solicitacoes', 'sol_forma_pagamento_fk')) {
      pendingConstraints.push(
        'ALTER TABLE `solicitacoes` ADD CONSTRAINT `sol_forma_pagamento_fk` '
        + 'FOREIGN KEY (`forma_pagamento_id`) REFERENCES `financeiro_formas_pagamento` (`id`) '
        + 'ON UPDATE CASCADE ON DELETE SET NULL'
      );
    }

    // A copia local contem datas legadas `0000-00-00`. O MySQL revalida toda a tabela ao criar
    // uma FK e, em modo estrito, falha por causa dessas colunas que nao fazem parte desta migration.
    // A flexibilizacao e restrita a conexao abaixo e o modo original e restaurado no `finally`.
    await addForeignKeysPreservingLegacyDates(sequelize, pendingConstraints);
  },

  async down() {
    // Sem rollback destrutivo: estes dados passam a compor o historico da solicitacao.
  }
};
