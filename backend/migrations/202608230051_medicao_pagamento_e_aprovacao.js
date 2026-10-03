'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Dados de pagamento e aprovacao da MEDICAO (Fase 3 do lote de 23/08).
 *
 * O favorecido saiu da abertura do contrato e passou para a medicao: quem recebe pode mudar de uma
 * medicao para outra, e defini-lo na abertura obrigava a acertar no comeco algo que so se sabe no
 * fim.
 *
 * `favorecido_chave_pix` guarda a chave COPIADA, e nao um apontamento para o cadastro: a chave do
 * parceiro pode mudar depois, e a medicao tem de dizer para onde o dinheiro foi NAQUELE pagamento.
 * E a mesma razao de `valor_previsto` existir ao lado de `valor` nas parcelas.
 *
 * O aceite dos dados grava QUEM e QUANDO, e nao um booleano: "confirmei que os dados de pagamento
 * estao corretos" e uma declaracao de responsabilidade, e um `1` nao diz de quem.
 *
 * `aprovada_em` / `aprovada_por` sao o que faz o status da solicitacao andar: medicao pedida deixa a
 * solicitacao em NEC. DE MEDICAO; aprovada, em LIBERADO. Sem a coluna, o calculo automatico nao teria
 * como distinguir as duas situacoes.
 *
 * Todas anulaveis: as medicoes que ja existem nao tem nada disso, e coluna obrigatoria em tabela com
 * dado nao sobe — `server.js` roda as migrations antes de abrir a porta.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`.
 */
const COLUNAS = [
  ['favorecido_id', 'INTEGER'],
  ['favorecido_chave_pix', 'STRING_180'],
  ['favorecido_contato', 'STRING_180'],
  ['forma_pagamento_id', 'INTEGER'],
  ['dados_confirmados_em', 'DATE'],
  ['dados_confirmados_por', 'INTEGER'],
  ['aprovada_em', 'DATE'],
  ['aprovada_por', 'INTEGER']
];

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tipos = {
      INTEGER: { type: DataTypes.INTEGER, allowNull: true },
      STRING_180: { type: DataTypes.STRING(180), allowNull: true },
      DATE: { type: DataTypes.DATE, allowNull: true }
    };

    for (const [coluna, tipo] of COLUNAS) {
      // eslint-disable-next-line no-await-in-loop
      if (await columnExists(sequelize, 'contrato_medicoes', coluna)) continue;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addColumn('contrato_medicoes', coluna, tipos[tipo]);
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
