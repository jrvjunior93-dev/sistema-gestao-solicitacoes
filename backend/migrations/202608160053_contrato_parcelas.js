'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

/**
 * Parcelas de contrato do fluxo novo.
 *
 * Tabela propria, e nao titulos financeiros, por decisao de desenho registrada em
 * MAPA-IMPACTO-PARCELAS.md: das 53 consultas a titulos_financeiros no backend, 34 nao
 * filtram status e outras 8 usam filtro negativo — 42 capturariam qualquer status novo.
 * Parcela de contrato ainda nao aprovado nao pode aparecer no financeiro, e mante-la fora
 * de titulos_financeiros resolve isso para as consultas de hoje e para as futuras.
 *
 * A parcela vira titulo no momento da aprovacao; `titulo_financeiro_id` guarda o vinculo.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const columns = {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      contrato_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'contratos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      numero: { type: DataTypes.INTEGER, allowNull: false },
      valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },

      // PREVISAO enquanto o contrato aguarda aprovacao; APROVADA quando vira titulo;
      // REJEITADA quando o contrato e recusado.
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PREVISAO' },

      // Parcela travada nao entra na redistribuicao: ja virou titulo ou esta comprometida
      // em solicitacao aberta.
      travada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      // Preenchido na aprovacao. Ate la a parcela nao existe no financeiro.
      titulo_financeiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'titulos_financeiros', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      parceiro_id: { type: DataTypes.INTEGER, allowNull: true },
      forma_pagamento_id: { type: DataTypes.INTEGER, allowNull: true },
      observacao: { type: DataTypes.STRING(255), allowNull: true },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      atualizado_por: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    };
    if (!(await tableExists(sequelize, 'contrato_parcelas'))) {
      await queryInterface.createTable('contrato_parcelas', columns);
    }

    // DDL no MySQL confirma cada indice separadamente. Se uma tentativa anterior
    // parou depois da tabela ou de um indice, completar apenas o que falta.
    const indices = [
      { columns: ['contrato_id', 'numero'], name: 'contrato_parcelas_numero_unico', unique: true },
      { columns: ['contrato_id', 'status'], name: 'contrato_parcelas_contrato_status' },
      { columns: ['titulo_financeiro_id'], name: 'contrato_parcelas_titulo' }
    ];
    for (const { columns, ...options } of indices) {
      if (!(await indexExists(sequelize, 'contrato_parcelas', options.name))) {
        await queryInterface.addIndex('contrato_parcelas', columns, options);
      }
    }
  },

  async down() {
    // Sem rollback destrutivo: as parcelas sao o registro do contrato.
  }
};
