'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * Vinculo entre a solicitacao de MEDICAO e as parcelas de contrato que ela consumiu (MD-6).
 *
 * A medicao do fluxo novo NAO cria titulo: ela se vincula ao que ja existe. Sem esta tabela
 * o consumo ficaria invisivel — a parcela apareceria com valor menor e ninguem saberia qual
 * medicao a reduziu.
 *
 * `valor_anterior` e `vencimento_anterior` guardam o estado da parcela ANTES da medicao. Sao
 * redundantes com um log, e de proposito: e o que permite explicar (e desfazer) a alteracao
 * sem depender de outra fonte.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'medicao_parcelas')) return;

    await queryInterface.createTable('medicao_parcelas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'solicitacoes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contrato_parcela_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'contrato_parcelas', key: 'id' },
        onUpdate: 'CASCADE',
        // RESTRICT de proposito: apagar uma parcela medida deixaria a medicao sem lastro.
        onDelete: 'RESTRICT'
      },

      // Quanto desta medicao saiu desta parcela.
      valor_medido: { type: DataTypes.DECIMAL(14, 2), allowNull: false },

      // O estado da parcela antes desta medicao — trilha de auditoria (MD-7).
      valor_anterior: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      vencimento_anterior: { type: DataTypes.DATEONLY, allowNull: false },
      vencimento_aplicado: { type: DataTypes.DATEONLY, allowNull: false },

      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    await Promise.all([
      // Uma parcela entra uma unica vez na mesma medicao.
      queryInterface.addIndex('medicao_parcelas', ['solicitacao_id', 'contrato_parcela_id'], {
        name: 'medicao_parcelas_unico',
        unique: true
      }),
      queryInterface.addIndex('medicao_parcelas', ['contrato_parcela_id'], {
        name: 'medicao_parcelas_parcela'
      })
    ]);
  },

  async down() {
    // Sem rollback destrutivo: a tabela e o registro de quem consumiu cada parcela.
  }
};
