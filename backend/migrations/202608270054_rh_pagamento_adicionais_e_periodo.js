'use strict';

const { columnExists, foreignKeyExists } = require('../src/database/schemaUtils');

/**
 * FASE 12 DO DP — OS ADICIONAIS E O PERIODO DO PAGAMENTO (27/08).
 *
 * O item 11 do escopo pede, no formulario de cada colaborador, adicional noturno, de insalubridade,
 * de periculosidade e bonificacoes. Hoje tudo isso cabe em `acrescimos`, um campo unico.
 *
 * POR QUE COLUNAS SEPARADAS, E NAO UM CAMPO SO.
 *
 * Nao e preciosismo de modelagem: os quatro tem naturezas legais DIFERENTES. Insalubridade e
 * periculosidade sao percentuais definidos por norma e nao se acumulam entre si; adicional noturno
 * depende da hora trabalhada; bonificacao e liberalidade da empresa. Somados num campo, a
 * "planilha-resumo para conferencia" que o escopo pede nao teria o que conferir — ela mostraria um
 * numero unico que ninguem consegue contestar linha a linha.
 *
 * E o dia em que alguem perguntar "quanto a obra pagou de periculosidade no ano" a resposta seria
 * reabrir os pedidos um a um.
 *
 * `acrescimos` NAO E APAGADA. Ela continua recebendo o que nao se encaixa nos quatro, e continua
 * sendo o que os registros antigos usaram. Somar as cinco e trabalho do calculo, nao do schema.
 *
 * O PERIODO VAI NA APURACAO, e nao so no `dados_json` do pedido. O escopo pede "periodo trabalhado"
 * e "data prevista para pagamento" como campos obrigatorios da solicitacao; mas quem e consultado
 * depois — no relatorio, na conferencia, no fechamento — e a apuracao. Deixar a data so no JSON do
 * pedido faria todo relatorio ter de abrir o pedido para saber quando aquilo seria pago.
 *
 * TUDO ANULAVEL: ha apuracao gravada, e migration nao preenche dado (Regra 5). A obrigatoriedade
 * e do pedido novo e mora em `validarPedido`.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md` (Regra 3). So estrutura.
 */

const EVENTOS = 'rh_apuracao_eventos';
const APURACOES = 'rh_apuracoes';

const ADICIONAIS = [
  ['adicional_noturno', 'ajuste_credito_manual'],
  ['adicional_insalubridade', 'adicional_noturno'],
  ['adicional_periculosidade', 'adicional_insalubridade'],
  ['bonificacoes', 'adicional_periculosidade']
];

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const [nome, depoisDe] of ADICIONAIS) {
      if (await columnExists(sequelize, EVENTOS, nome)) continue;
      await queryInterface.addColumn(EVENTOS, nome, {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
        after: depoisDe
      });
    }

    const naApuracao = [
      ['periodo_inicio', DataTypes.DATEONLY, 'dias_base'],
      ['periodo_fim', DataTypes.DATEONLY, 'periodo_inicio'],
      ['data_prevista_pagamento', DataTypes.DATEONLY, 'periodo_fim'],
      // De qual pedido do DP esta apuracao nasceu. Anulavel: as apuracoes que ja existem nasceram
      // antes de o pedido de pagamento existir como tipo.
      ['solicitacao_id', DataTypes.INTEGER, 'data_prevista_pagamento']
    ];
    for (const [nome, tipo, depoisDe] of naApuracao) {
      if (await columnExists(sequelize, APURACOES, nome)) continue;
      await queryInterface.addColumn(APURACOES, nome, { type: tipo, allowNull: true, after: depoisDe });
    }

    // Nome explicito — Regra 6.
    if (!(await foreignKeyExists(sequelize, APURACOES, 'fk_rh_apuracao_solicitacao'))) {
      await queryInterface.addConstraint(APURACOES, {
        fields: ['solicitacao_id'],
        type: 'foreign key',
        name: 'fk_rh_apuracao_solicitacao',
        references: { table: 'rh_solicitacoes', field: 'id' },
        onUpdate: 'CASCADE',
        // RESTRICT: apagar o pedido nao pode arrastar a apuracao, que e o que foi efetivamente pago.
        onDelete: 'RESTRICT'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: as colunas guardam valores pagos.
  }
};
