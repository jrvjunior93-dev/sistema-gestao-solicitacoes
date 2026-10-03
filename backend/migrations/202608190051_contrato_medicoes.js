'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

/**
 * `contrato_medicoes`: a identidade da medicao depois que ela deixou de ser uma solicitacao.
 *
 * PI-16 tirou da medicao a solicitacao propria — a unidade de aprovacao e pagamento passou a ser
 * o TITULO. Mas a medicao continua sendo um evento com vida: tem periodo, tem numero, e o cliente
 * pediu que cada titulo no card do Financeiro abra um modal com os ANEXOS e COMENTARIOS da medicao
 * que o gerou. Nada disso tem onde morar sem um registro proprio.
 *
 * Sem esta tabela a medicao ficaria rastreavel apenas por `medicao_parcelas.solicitacao_id` — que,
 * depois da PI-16, passa a ser SEMPRE a mesma solicitacao do contrato. Todas as medicoes de um
 * contrato ficariam indistinguiveis entre si.
 *
 * Ela tambem resolve o "numero automatico da medicao" que o escopo do cliente pedia: o numero e
 * sequencial POR CONTRATO (medicao 1, 2, 3 daquele contrato), nao global — e o indice unico
 * garante que duas medicoes simultaneas nao peguem o mesmo numero.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'contrato_medicoes'))) {
      await queryInterface.createTable('contrato_medicoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        contrato_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'contratos', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        // Solicitacao do contrato (PI-16). Guardado aqui tambem para a consulta do detalhe nao
        // precisar passar pelo contrato so para achar as medicoes da tela.
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },

        // Sequencial POR CONTRATO: e o "numero da medicao" que o escopo pediu.
        numero: { type: DataTypes.INTEGER, allowNull: false },

        periodo_inicio: { type: DataTypes.DATEONLY, allowNull: true },
        periodo_fim: { type: DataTypes.DATEONLY, allowNull: true },
        // Soma medida nesta medicao, em reais. Redundante com a soma de `medicao_parcelas`, e de
        // proposito: e o numero que a tela mostra, e recalcular a cada listagem sairia caro.
        valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });

      // Duas medicoes do mesmo contrato nao podem dividir o numero. E a guarda que sobrevive a
      // duas gravacoes concorrentes — contar registros antes de inserir, nao.
      await queryInterface.addIndex('contrato_medicoes', ['contrato_id', 'numero'], {
        name: 'contrato_medicoes_contrato_numero',
        unique: true
      });
    }

    // Liga cada parcela medida ao evento de medicao. Sem isto, `medicao_parcelas` so sabe dizer
    // "esta parcela foi medida em alguma medicao desta solicitacao" — e a solicitacao e uma so.
    if (!(await columnExists(sequelize, 'medicao_parcelas', 'medicao_id'))) {
      await queryInterface.addColumn('medicao_parcelas', 'medicao_id', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
      await queryInterface.addIndex('medicao_parcelas', ['medicao_id'], {
        name: 'medicao_parcelas_medicao_id'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
