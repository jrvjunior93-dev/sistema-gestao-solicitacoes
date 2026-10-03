'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

/*
  Reforma de Custos e Recebiveis (29/09/2026), Fase 2:
  - cr_prazos_obra: janelas de prazo configuradas por obra (ausente = padrao
    25 -> 5 para planejamento e 40 dias para a medicao aprovada);
  - cr_dilatacoes: pedidos de dilatacao do prazo da medicao aprovada (2 a 5
    dias), com decisao do administrador e historico;
  - cr_medicao_sem_registro: mes em que o fiscal nao mediu nada, registrado
    com justificativa (cumpre a obrigacao da medicao aprovada).
  Tabelas novas e isoladas: cr_competencias nao muda.
*/
const TABLES = {
  prazos: 'cr_prazos_obra',
  dilatacoes: 'cr_dilatacoes',
  semMedicao: 'cr_medicao_sem_registro'
};

function timestamps(DataTypes) {
  return {
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  };
}

async function createIfMissing(queryInterface, sequelize, tableName, columns) {
  if (!(await tableExists(sequelize, tableName))) {
    await queryInterface.createTable(tableName, columns);
  }
}

async function addIndexIfMissing(queryInterface, sequelize, tableName, fields, options) {
  if (!(await indexExists(sequelize, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    await createIfMissing(queryInterface, sequelize, TABLES.prazos, {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      obra_id: { type: DataTypes.INTEGER, allowNull: false },
      planejamento_dia_abertura: { type: DataTypes.INTEGER, allowNull: false },
      planejamento_dia_fechamento: { type: DataTypes.INTEGER, allowNull: false },
      medicao_prazo_dias: { type: DataTypes.INTEGER, allowNull: false },
      atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
      ...timestamps(DataTypes)
    });
    await addIndexIfMissing(queryInterface, sequelize, TABLES.prazos, ['obra_id'], {
      name: 'uq_cr_prazos_obra_obra',
      unique: true
    });

    await createIfMissing(queryInterface, sequelize, TABLES.dilatacoes, {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      obra_id: { type: DataTypes.INTEGER, allowNull: false },
      competencia_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'cr_competencias', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      dias: { type: DataTypes.INTEGER, allowNull: false },
      motivo: { type: DataTypes.TEXT, allowNull: false },
      situacao: {
        type: DataTypes.ENUM('SOLICITADA', 'APROVADA', 'NEGADA'),
        allowNull: false,
        defaultValue: 'SOLICITADA'
      },
      solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
      decidido_por: { type: DataTypes.INTEGER, allowNull: true },
      decidido_em: { type: DataTypes.DATE, allowNull: true },
      observacao_decisao: { type: DataTypes.TEXT, allowNull: true },
      prazo_anterior: { type: DataTypes.DATE, allowNull: true },
      prazo_novo: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(DataTypes)
    });
    await addIndexIfMissing(queryInterface, sequelize, TABLES.dilatacoes, ['competencia_id', 'situacao'], {
      name: 'idx_cr_dilatacoes_competencia_situacao'
    });
    await addIndexIfMissing(queryInterface, sequelize, TABLES.dilatacoes, ['obra_id', 'createdAt'], {
      name: 'idx_cr_dilatacoes_obra_criacao'
    });

    await createIfMissing(queryInterface, sequelize, TABLES.semMedicao, {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      competencia_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'cr_competencias', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      registrado_por: { type: DataTypes.INTEGER, allowNull: false },
      registrado_em: { type: DataTypes.DATE, allowNull: false },
      ...timestamps(DataTypes)
    });
    await addIndexIfMissing(queryInterface, sequelize, TABLES.semMedicao, ['competencia_id'], {
      name: 'uq_cr_medicao_sem_registro_competencia',
      unique: true
    });
  },

  async down({ queryInterface, sequelize }) {
    for (const table of [TABLES.semMedicao, TABLES.dilatacoes, TABLES.prazos]) {
      if (await tableExists(sequelize, table)) await queryInterface.dropTable(table);
    }
  }
};
