'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `medicao_id` em `anexos` e `historicos`: a qual medicao o documento e o comentario pertencem.
 *
 * Consequencia direta da PI-16. Antes, cada medicao era uma solicitacao, entao a nota fiscal e os
 * comentarios daquela medicao ficavam naturalmente separados: eram anexos e historicos de outra
 * `solicitacao_id`. Com UMA solicitacao por contrato, tudo passaria a se empilhar no mesmo lugar,
 * e um contrato com 19 medicoes viraria uma pilha unica de documentos sem dono.
 *
 * O cliente pediu explicitamente o contrario: cada titulo no card do Financeiro abre um modal com
 * os anexos e comentarios DAQUELA medicao. Esta coluna e o que torna esse modal possivel.
 *
 * Anulavel: anexo e historico da propria solicitacao (a abertura do contrato, a minuta do
 * Juridico, o contrato assinado) nao pertencem a medicao nenhuma e ficam com NULL. Todo o
 * historico existente — anexos e historicos das 665 medicoes legadas — permanece com NULL e segue
 * sendo lido pela `solicitacao_id`, exatamente como hoje.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const tabela of ['anexos', 'historicos']) {
      // eslint-disable-next-line no-await-in-loop
      if (await columnExists(sequelize, tabela, 'medicao_id')) continue;

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addColumn(tabela, 'medicao_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addIndex(tabela, ['medicao_id'], {
        name: `${tabela}_medicao_id`
      });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
