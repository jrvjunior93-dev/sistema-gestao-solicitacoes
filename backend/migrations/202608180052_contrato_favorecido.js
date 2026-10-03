'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `favorecido_id`: quem RECEBE o pagamento do contrato (PI-12).
 *
 * Os contratados respondem pelo contrato — podem ser varios, e ja vivem em `contrato_credores`.
 * O pagamento, porem, vai a UM favorecido, que **pode ser um terceiro**: nao precisa estar
 * entre os contratados. Por isso e coluna propria, e nao "o primeiro credor".
 *
 * Contratos existentes permanecem sem favorecido explicito ate uma alteracao feita pela
 * interface. A migration nao infere nem grava dados antigos.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'favorecido_id')) return;

    await queryInterface.addColumn('contratos', 'favorecido_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'parceiros', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
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
    // Sem rollback destrutivo: o favorecido e quem recebe o dinheiro.
  }
};
