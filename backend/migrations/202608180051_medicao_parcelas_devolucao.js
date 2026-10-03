'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Devolucao de comprometimento (PI-6).
 *
 * Quando o titulo de uma parcela e EXCLUIDO, o valor volta como saldo para a parcela final do
 * contrato. Para o saldo realmente voltar, o comprometimento daquela medicao precisa deixar de
 * contar — `saldo = total - comprometido`; sem isto o dinheiro ficaria preso para sempre.
 *
 * A linha do vinculo NAO e apagada: ela e a trilha de quem mediu o que. `devolvido_em` marca
 * que aquele comprometimento foi desfeito, e `devolvido_motivo` diz por que.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await columnExists(sequelize, 'medicao_parcelas', 'devolvido_em'))) {
      await queryInterface.addColumn('medicao_parcelas', 'devolvido_em', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!(await columnExists(sequelize, 'medicao_parcelas', 'devolvido_motivo'))) {
      await queryInterface.addColumn('medicao_parcelas', 'devolvido_motivo', {
        type: DataTypes.STRING(255),
        allowNull: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: a devolucao e parte da trilha do contrato.
  }
};
