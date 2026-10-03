'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Copia da chave PIX confirmada na abertura da solicitacao.
 *
 * A chave fica na solicitacao porque o cadastro do parceiro pode mudar depois. Assim, o Financeiro
 * consegue consultar exatamente o dado informado para aquele pedido, inclusive quando o usuario
 * substituiu manualmente uma das tres chaves sugeridas pelo cadastro.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'solicitacoes', 'favorecido_chave_pix')) return;

    await queryInterface.addColumn('solicitacoes', 'favorecido_chave_pix', {
      type: DataTypes.STRING(255),
      allowNull: true
    });
  },

  async down() {
    // Sem rollback destrutivo: a chave confirmada faz parte do historico do pagamento solicitado.
  }
};
