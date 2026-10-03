'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `contratos.solicitacao_id`: o elo do contrato com a sua solicitacao unica (PI-16).
 *
 * A abertura de contrato passou a nascer como uma SOLICITACAO — a unica daquele contrato, que o
 * acompanha por toda a vida dele. Medicoes e aditivos do fluxo novo alteram essa solicitacao em
 * vez de criar novas.
 *
 * Anulavel de proposito: os 335 contratos LEGADOS nunca tiveram solicitacao-mae, e inventar uma
 * para eles seria fabricar historico. Contrato sem `solicitacao_id` e, por definicao, contrato da
 * trilha antiga.
 *
 * O vinculo inverso ja existia (`solicitacoes.contrato_id`), mas ele e de muitos-para-um: 656 das
 * 665 medicoes historicas apontam para um contrato. Este aqui e o de um-para-um, e responde a
 * outra pergunta: "qual e A solicitacao deste contrato".
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'solicitacao_id')) return;

    await queryInterface.addColumn('contratos', 'solicitacao_id', {
      type: DataTypes.INTEGER,
      allowNull: true
    });

    // Sem FK: `solicitacoes` ja aponta para `contratos`, e fechar o ciclo com duas FKs rigidas
    // trava a ordem de insercao dentro da transacao que cria os dois juntos.
    await queryInterface.addIndex('contratos', ['solicitacao_id'], {
      name: 'contratos_solicitacao_id'
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
