'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `link_assinatura` em `contratos`: onde o contrato é assinado eletronicamente.
 *
 * Pedido do cliente (20/08): ao concluir a minuta, o Jurídico precisa entregar **o documento, o
 * link da plataforma de assinatura, ou os dois**. Até aqui a etapa `minuta` era só um botão que
 * trocava o status — o responsável recebia "colete a assinatura" sem receber de quê.
 *
 * O arquivo já tem onde morar (`contrato_anexos`, com `tipo`). O link não tinha, e guardá-lo no
 * histórico como texto o tornaria impossível de exibir num botão ou de conferir na aprovação.
 *
 * Anulável: contrato que circula em papel não tem link, e é caso legítimo.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'link_assinatura')) return;

    await queryInterface.addColumn('contratos', 'link_assinatura', {
      type: DataTypes.STRING(500),
      allowNull: true
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
