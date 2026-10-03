'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * VINCULO DO COLABORADOR COM A OBRA, COM VIGENCIA (Fase 1 do modulo DP, 25/08).
 *
 * O problema que esta tabela resolve: hoje a lotacao do colaborador mora em
 * `rh_colaboradores.obra_id`, uma coluna so. Transferir alguem de obra REESCREVE o presente e
 * APAGA o passado — nao ha como saber que o colaborador esteve na obra A ate certa data e na B
 * depois.
 *
 * Isso nao e um incomodo de auditoria: e o que inviabiliza o custo de mao de obra por obra, que e
 * justamente o numero que o cliente quer medir. Qualquer periodo que atravesse uma transferencia
 * atribui o custo inteiro a obra ATUAL, e a obra anterior aparece mais barata do que foi.
 *
 * Por isso esta e a Fase 1 e nao a 6: e dado, nao tela. Depois que os pedidos de troca de obra
 * existirem (Fase 2), passa a ser tarde — cada transferencia feita sem esta tabela e um buraco
 * que nenhum backfill futuro consegue preencher, porque a informacao nao ficou em lugar nenhum.
 *
 * `rh_colaboradores.obra_id` CONTINUA existindo e continua sendo a obra corrente: e o que as
 * telas, os filtros e a apuracao ja leem. Esta tabela e o historico ao lado dele, alimentada
 * sempre que a obra muda. Trocar as leituras existentes de lugar seria uma refatoracao grande e
 * sem ganho — a coluna e um cache correto do vinculo aberto.
 *
 * `vigencia_fim` nulo significa VINCULO ABERTO (o colaborador esta nesta obra hoje). Nulo, e nao
 * uma data no futuro, porque nao se sabe quando termina — e uma data-sentinela obrigaria todo
 * SELECT a conhecer a sentinela.
 *
 * `motivo` diz de onde o vinculo veio:
 *   CARGA_INICIAL — os 137 colaboradores que ja existiam quando a tabela nasceu
 *   ADMISSAO      — comeco do vinculo
 *   TROCA_OBRA    — transferencia
 *   DEMISSAO      — fechamento do vinculo por desligamento
 *   AJUSTE        — correcao pelo cadastro, sem pedido formal (deixa de existir na Fase 2)
 *
 * `solicitacao_id` fica ANULAVEL e SEM chave estrangeira de proposito. Anulavel porque na Fase 1
 * ainda nao existe pedido nenhum — o fluxo e a Fase 2. Sem FK porque em 24/08 preencher
 * `titulos_financeiros.solicitacao_id` fez o `ON DELETE RESTRICT` disparar e derrubou quatro
 * suites que apagavam a solicitacao antes do titulo: ao ligar uma coluna a uma chave, a pergunta
 * nao e so "quem le isto?", e tambem "o que a chave passa a impedir?".
 *
 * `obra_id` tambem fica sem FK, pela mesma razao e por uma segunda: o historico precisa
 * sobreviver a obra. Se uma obra for removida algum dia, o custo que passou por ela ja aconteceu.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria estrutura e NADA MAIS. Registros
 * anteriores nao recebem carga automatica; os vinculos passam a nascer das operacoes feitas
 * pela interface (regra de 24/08 — migration nao mexe em dado).
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'rh_colaborador_vinculos')) return;

    await queryInterface.createTable('rh_colaborador_vinculos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      colaborador_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'rh_colaboradores', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Sem FK de proposito (ver cabecalho). Anulavel: colaborador de escritorio nao tem obra.
      obra_id: { type: DataTypes.INTEGER, allowNull: true },
      setor_id: { type: DataTypes.INTEGER, allowNull: true },

      vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      // NULO = vinculo aberto, o colaborador esta nesta obra hoje.
      vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },

      motivo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'AJUSTE' },
      // O pedido que originou a mudanca, quando vier do fluxo (Fase 2). Sem FK (ver cabecalho).
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },

      observacoes: { type: DataTypes.TEXT, allowNull: true },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },

      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    // "Onde este colaborador esteve, em ordem" — a leitura do historico dele.
    await queryInterface.addIndex('rh_colaborador_vinculos', ['colaborador_id', 'vigencia_inicio'], {
      name: 'rh_vinculos_colaborador_inicio'
    });

    // "Quem estava nesta obra naquele periodo" — a leitura do custo por obra.
    await queryInterface.addIndex('rh_colaborador_vinculos', ['obra_id', 'vigencia_inicio', 'vigencia_fim'], {
      name: 'rh_vinculos_obra_periodo'
    });

    // "Qual o vinculo aberto deste colaborador" — a pergunta mais frequente do servico.
    await queryInterface.addIndex('rh_colaborador_vinculos', ['colaborador_id', 'vigencia_fim'], {
      name: 'rh_vinculos_colaborador_aberto'
    });
  },

  async down() {
    // Sem rollback destrutivo: o vinculo E o historico. Derrubar a tabela perde o que ela guarda.
  }
};
