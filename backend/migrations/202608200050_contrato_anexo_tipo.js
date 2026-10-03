'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `tipo` em `contrato_anexos`: qual papel aquele arquivo cumpre no contrato.
 *
 * Nasce da decisão do cliente (20/08) de que a **negociação detalhada** — obrigatória acima do
 * limite do Jurídico — deixa de ser um campo de texto e passa a ser um documento anexado.
 *
 * Sem esta coluna não haveria como o backend cobrar o documento na aprovação: `contrato_anexos` só
 * guardava nome e caminho, então "tem anexo" seria a única pergunta possível — e qualquer arquivo
 * (a foto de uma nota, um comprovante) satisfaria a exigência da negociação detalhada.
 *
 * Anulável de propósito: todo anexo já existente, e todo anexo avulso daqui para a frente, fica com
 * NULL. Só o documento da negociação recebe `NEGOCIACAO_DETALHADA`.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contrato_anexos', 'tipo')) return;

    await queryInterface.addColumn('contrato_anexos', 'tipo', {
      type: DataTypes.STRING(40),
      allowNull: true
    });

    // A pergunta que a aprovação faz é sempre "este contrato tem anexo DESTE tipo?".
    await queryInterface.addIndex('contrato_anexos', ['contrato_id', 'tipo'], {
      name: 'contrato_anexos_contrato_tipo'
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
