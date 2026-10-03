'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

async function adicionarColuna(queryInterface, sequelize, tabela, coluna, definicao) {
  if (!(await columnExists(sequelize, tabela, coluna))) {
    await queryInterface.addColumn(tabela, coluna, definicao);
  }
}

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    await adicionarColuna(queryInterface, sequelize, 'rh_importacoes', 'etapa_pagamento', {
      type: DataTypes.STRING(20), allowNull: true
    });
    await adicionarColuna(queryInterface, sequelize, 'rh_importacoes', 'idempotency_key', {
      type: DataTypes.STRING(80), allowNull: true
    });
    if (!(await indexExists(sequelize, 'rh_importacoes', 'uq_rh_importacoes_idempotency_key'))) {
      await queryInterface.addIndex('rh_importacoes', ['idempotency_key'], {
        name: 'uq_rh_importacoes_idempotency_key', unique: true
      });
    }
    await adicionarColuna(queryInterface, sequelize, 'rh_apuracoes', 'etapa_pagamento', {
      type: DataTypes.STRING(20), allowNull: true
    });
    await adicionarColuna(queryInterface, sequelize, 'rh_apuracoes', 'importacao_id', {
      type: DataTypes.INTEGER, allowNull: true
    });
    if (!(await indexExists(sequelize, 'rh_apuracoes', 'idx_rh_apuracoes_etapa'))) {
      await queryInterface.addIndex('rh_apuracoes', ['competencia', 'etapa_pagamento', 'obra_id'], {
        name: 'idx_rh_apuracoes_etapa'
      });
    }
    if (!(await tableExists(sequelize, 'rh_colaborador_calculo_historicos'))) {
      await queryInterface.createTable('rh_colaborador_calculo_historicos', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
        forma_calculo: { type: DataTypes.STRING(20), allowNull: false },
        valor_diaria: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
        pagamento_automatico_40_60: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: false },
        vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },
        alterado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
    if (!(await indexExists(sequelize, 'rh_colaborador_calculo_historicos', 'idx_rh_colaborador_calculo_vigencia'))) {
      await queryInterface.addIndex('rh_colaborador_calculo_historicos', ['colaborador_id', 'vigencia_inicio'], {
        name: 'idx_rh_colaborador_calculo_vigencia', unique: true
      });
    }
  },

  // Historicos de calculo e identificadores de pagamentos nao podem ser descartados por rollback.
  async down() {}
};
