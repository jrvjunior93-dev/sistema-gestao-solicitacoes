'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * Termos aditivos do contrato (escopo 3.1.1 / 3.2.1).
 *
 * Tabela propria, e nao apenas uma soma em `contratos.valor_aditivos`, porque o teto de 25%
 * precisa saber QUAIS aditivos foram aprovados e quais foram recusados — o cliente pediu que
 * o rejeitado libere o valor de volta, e um contador nao permite isso.
 *
 * `valor_aditivos` do contrato continua sendo a fonte do saldo; ele so e alimentado na
 * APROVACAO do aditivo, nunca na solicitacao.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'contrato_aditivos')) return;

    await queryInterface.createTable('contrato_aditivos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      contrato_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'contratos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Solicitacao que originou o aditivo, quando vier pela Nova Solicitacao.
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },

      valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      // Prazo: ate quando o contrato passa a valer com este aditivo.
      nova_vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      responsavel_id: { type: DataTypes.INTEGER, allowNull: true },

      // PENDENTE -> APROVADO | REJEITADO. So APROVADO consome o teto de 25%.
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
      motivo_rejeicao: { type: DataTypes.STRING(255), allowNull: true },
      aprovado_por: { type: DataTypes.INTEGER, allowNull: true },
      aprovado_em: { type: DataTypes.DATE, allowNull: true },

      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    await queryInterface.addIndex('contrato_aditivos', ['contrato_id', 'status'], {
      name: 'contrato_aditivos_contrato_status'
    });
  },

  async down() {
    // Sem rollback destrutivo: o aditivo e parte do historico do contrato.
  }
};
