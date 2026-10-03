'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * O PEDIDO DE PESSOAL (Fase 2 do modulo DP, 25/08).
 *
 * POR QUE UMA TABELA PROPRIA, e nao `solicitacoes`.
 *
 * O mapa do modulo dizia para nao construir um segundo motor de workflow — declarar tipos novos
 * sobre `solicitacoes`. O levantamento e o cliente derrubaram isso:
 *
 * 1. admissao (tipo 9) e demissao (tipo 18) JA existem em `solicitacoes` e sao usadas — 239
 *    registros, o mais recente de 13/08. Mas os status de la (`APROVADA PELO DP`, `COM A
 *    CONTABILIDADE`, `PAGA`) sao de PAGAMENTO e de PROVIDENCIA CONTABIL, nao de pessoal. O proprio
 *    cadastro do tipo confirma: ADMISSAO tem `exige_valor` e `exige_apropriacao_principal` — um
 *    pedido de admitir uma pessoa nao tem valor nem apropriacao; um pedido de PAGAR a admissao tem;
 * 2. o cliente decidiu que o DP passa a ser operado dentro do modulo, e nao mais pelo modulo
 *    principal;
 * 3. mexer nos tipos 9 e 18 tocaria um fluxo em uso diario. Nao tocar custa uma tabela.
 *
 * O que E reaproveitado nao e tabela, e PADRAO: permissao estrita por acao, devolucao que volta ao
 * setor de quem criou, historico com o setor gravado como TEXTO (nunca o objeto — o `[object
 * Object]` de 24/08), reenvio com a fila parqueada, visibilidade por setor.
 *
 * `tipo` nasce com quatro valores e ja preve o quinto:
 *   ADMISSAO · DEMISSAO · TROCA_OBRA · EVENTO_RECORRENTE · ALTERACAO_SALARIAL (Fase 5)
 *
 * EVENTO_RECORRENTE esta aqui porque o cliente respondeu, em 25/08, que vale alimentacao e desconto
 * de adiantamento seguem "Obra solicita, DP valida e confirma" — que e este fluxo, e nao uma tela
 * de cadastro a parte.
 *
 * `colaborador_id` e ANULAVEL por uma razao so, e ela e importante: no pedido de ADMISSAO o
 * colaborador AINDA NAO EXISTE. Ele nasce quando o DP aprova. Nos outros tipos e obrigatorio por
 * regra de servico, nao por coluna.
 *
 * `dados_json` guarda o que e especifico de cada tipo — obra de destino, aviso previo, valor do
 * evento — em vez de dezenas de colunas anulaveis que so um tipo usa. O que e comum a TODOS os
 * tipos (situacao, quem pediu, quem decidiu, quando) tem coluna, porque e o que se consulta,
 * ordena e filtra.
 *
 * `situacao` e curta de proposito: ABERTA -> APROVADA | REJEITADA | CANCELADA. O ciclo do pedido de
 * pessoal e curto; quem tem seis etapas e o contrato.
 *
 * SEM FK em `obra_id` e `decidida_por`, pela licao de 24/08: ao ligar uma coluna a uma chave, a
 * pergunta nao e so "quem le isto?" — e tambem "o que a chave passa a impedir?". `colaborador_id`
 * tem FK com CASCADE porque pedido de um colaborador que nao existe mais nao significa nada.
 *
 * O INDICE `(colaborador_id, situacao)` existe desde o comeco por causa de um requisito de TELA que
 * o cliente deu em 25/08: a lista de colaboradores mostra quem tem pedido em aberto PRIMEIRO, com
 * destaque. Sem esse indice a ordenacao varre pedido por colaborador, e a tela que existe para dar
 * agilidade fica lenta justamente quando ha muitos pedidos.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria estrutura e NADA MAIS.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'rh_solicitacoes'))) {
      await queryInterface.createTable('rh_solicitacoes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

        // Nulo na ADMISSAO: o colaborador so passa a existir quando o DP aprova.
        colaborador_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'rh_colaboradores', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        // ADMISSAO | DEMISSAO | TROCA_OBRA | EVENTO_RECORRENTE | ALTERACAO_SALARIAL
        tipo: { type: DataTypes.STRING(30), allowNull: false },

        // ABERTA | APROVADA | REJEITADA | CANCELADA
        situacao: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ABERTA' },

        // A obra de quem pede. Sem FK (ver cabecalho): o pedido sobrevive a obra.
        obra_id: { type: DataTypes.INTEGER, allowNull: true },
        // O setor de quem abriu — e para onde a devolucao volta.
        setor_origem: { type: DataTypes.STRING(60), allowNull: true },

        // O especifico de cada tipo: obra de destino, aviso previo, dados do evento recorrente.
        dados_json: { type: DataTypes.JSON, allowNull: true },

        justificativa: { type: DataTypes.TEXT, allowNull: true },
        motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },

        criada_por: { type: DataTypes.INTEGER, allowNull: true },
        decidida_por: { type: DataTypes.INTEGER, allowNull: true },
        decidida_em: { type: DataTypes.DATE, allowNull: true },

        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });

      // "Este colaborador tem pedido em aberto?" — a leitura que ordena a tela consolidada.
      await queryInterface.addIndex('rh_solicitacoes', ['colaborador_id', 'situacao'], {
        name: 'rh_solicitacoes_colaborador_situacao'
      });

      // "O que esta na fila do DP?" e "o que a minha obra pediu?"
      await queryInterface.addIndex('rh_solicitacoes', ['situacao', 'tipo'], {
        name: 'rh_solicitacoes_situacao_tipo'
      });
      await queryInterface.addIndex('rh_solicitacoes', ['obra_id', 'situacao'], {
        name: 'rh_solicitacoes_obra_situacao'
      });
    }

    if (!(await tableExists(sequelize, 'rh_solicitacao_historicos'))) {
      await queryInterface.createTable('rh_solicitacao_historicos', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

        solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'rh_solicitacoes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        // ABERTURA | APROVACAO | REJEICAO | CANCELAMENTO | REENVIO | COMENTARIO
        acao: { type: DataTypes.STRING(30), allowNull: false },
        descricao: { type: DataTypes.TEXT, allowNull: true },

        /**
         * TEXTO, sempre. Em 24/08 o historico do contrato gravou `[object Object]` em 23 linhas
         * porque o setor chegava como a associacao do Sequelize e alguem fez String() nela. A
         * coluna nao impede o defeito sozinha — quem impede e `setorParaHistorico()` —, mas o tipo
         * deixa claro o que se espera aqui.
         */
        setor: { type: DataTypes.STRING(60), allowNull: true },
        situacao_anterior: { type: DataTypes.STRING(20), allowNull: true },
        situacao_nova: { type: DataTypes.STRING(20), allowNull: true },

        usuario_id: { type: DataTypes.INTEGER, allowNull: true },

        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });

      await queryInterface.addIndex('rh_solicitacao_historicos', ['solicitacao_id', 'id'], {
        name: 'rh_solicitacao_historicos_pedido'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: o pedido e o historico dele sao rastro.
  }
};
