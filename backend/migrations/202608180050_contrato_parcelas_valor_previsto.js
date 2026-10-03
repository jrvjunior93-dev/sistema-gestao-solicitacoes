'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `valor_previsto`: o valor da parcela no momento em que o contrato foi criado.
 *
 * Existe para a conferencia que o cliente pediu (PI-5): comparar o **valor previsto na criacao
 * do contrato** com o **valor solicitado por parcela** na medicao. Sem esta coluna a comparacao
 * e impossivel — `valor` e sobrescrito a cada medicao e o previsto original se perde.
 *
 * Gravado UMA vez, na criacao, e nunca mais alterado. A trilha completa fica: `valor_previsto`
 * (origem) -> `medicao_parcelas.valor_anterior` (cada alteracao) -> `valor` (atual).
 *
 * Registros antigos permanecem nulos. O valor previsto passa a ser gravado pela aplicacao nas
 * criacoes e alteracoes feitas pela interface depois do deploy.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contrato_parcelas', 'valor_previsto')) return;

    await queryInterface.addColumn('contrato_parcelas', 'valor_previsto', {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    });

    // O BACKFILL SAIU DAQUI (24/08/2026).
    //
    // Regra do projeto: migration altera ESTRUTURA, nunca dados. `server.js` roda as migrations antes
    // de abrir a porta — um `UPDATE` aqui alteraria dados reais de producao sozinho, no deploy, sem
    // contagem antes nem conferencia depois.
    //
    // Registros anteriores permanecem nulos; nenhum script de dados acompanha o deploy.
  },

  async down() {
    // Sem rollback destrutivo: a coluna e a origem da trilha de auditoria.
  }
};
