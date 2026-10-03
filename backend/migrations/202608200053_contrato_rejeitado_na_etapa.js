'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * `rejeitado_na_etapa` em `contratos`: de onde o contrato foi devolvido.
 *
 * Ate 20/08 a rejeicao so existia na aprovacao da Gerencia de Processos, e `REJEITADO` era um beco
 * sem saida — o status era escrito num lugar e nao era lido como ponto de partida em lugar nenhum.
 * O responsavel corrigia e nao havia como devolver o contrato para a fila.
 *
 * Com o Juridico passando a poder rejeitar tambem, o reenvio precisa saber **para onde voltar**:
 * devolvido pela Gerencia volta para a Gerencia; devolvido pelo Juridico volta para o Juridico — e
 * nao para o inicio da fila, o que faria a Gerencia reaprovar o que ela ja tinha aprovado.
 *
 * Valores: `APROVACAO` | `JURIDICO`. Anulavel: contrato que nunca foi rejeitado nao tem etapa, e o
 * campo e limpo quando o contrato volta a andar.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md` (numeracao criada no V4).
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'contratos', 'rejeitado_na_etapa')) return;

    await queryInterface.addColumn('contratos', 'rejeitado_na_etapa', {
      type: DataTypes.STRING(20),
      allowNull: true
    });
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
