'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `rh_importacoes.origem` — de onde a jornada veio (Fase 4 do modulo DP, 26/08).
 *
 * O cliente pediu duas entradas para o pagamento de pessoal: "de forma individual direto no
 * colaborador ou atraves de um formulario onde a obra vai ter listados todos os colaboradores".
 *
 * A DECISAO: o formulario NAO ganha um caminho de calculo proprio. Ele grava exatamente a mesma
 * estrutura que a planilha ja grava — `rh_importacoes` + `rh_importacao_linhas` —, e a apuracao
 * continua sem saber a diferenca.
 *
 * Isso importa porque a alternativa era um segundo calculo de folha em paralelo ao que existe. Dois
 * calculos divergem: um ganha uma correcao que o outro nao ganha, e a partir dai o mesmo
 * colaborador recebe valores diferentes dependendo de por onde a obra digitou. Nao ha erro mais
 * caro de encontrar do que esse.
 *
 * Mas se a estrutura e a mesma, o RASTRO se perde: "quem digitou este dia de falta, e por onde?"
 * deixa de ter resposta. Por isso a coluna: ela e a unica coisa que distingue as duas origens
 * depois que os dados se encontram.
 *
 * `PLANILHA` como padrao porque tudo que existe hoje veio de planilha — e assumir o contrario faria
 * o historico existente mentir.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria coluna e NADA MAIS.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'rh_importacoes', 'origem')) return;

    await queryInterface.addColumn('rh_importacoes', 'origem', {
      // PLANILHA | FORMULARIO | INDIVIDUAL
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'PLANILHA'
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
