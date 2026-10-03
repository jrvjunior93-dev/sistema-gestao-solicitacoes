'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * EVENTOS RECORRENTES E OS ITENS DA FOLHA (Fase 4 do modulo DP, 26/08).
 *
 * O PROBLEMA. Hoje `rh_apuracao_eventos` tem `ajuste_credito_manual` e `ajuste_debito_manual`:
 * DOIS NUMEROS DIGITADOS A MAO, todo mes. Para pagar certo, alguem precisa lembrar de cabeca — ou
 * numa planilha a parte — que fulano tem vale alimentacao, que esta na 4a de 6 parcelas do
 * adiantamento, que tem pensao, que desconta plano de saude. E somar tudo num campo so, SEM MEMORIA
 * DO QUE O COMPOE. Se errar, ninguem descobre; se sair de ferias, o substituto nao tem como saber.
 *
 * Pedido do cliente, textual: "sem que o usuario precise ficar lembrando de cada um ou fazendo
 * controles paralelos".
 *
 * DUAS TABELAS, e a separacao entre elas e o ponto todo:
 *
 *   `rh_eventos_recorrentes`     — a REGRA. "Este colaborador desconta R$ 200 por mes, 6 vezes."
 *   `rh_apuracao_evento_itens`   — o LANCAMENTO. "Na folha de 08/2026 foram descontados R$ 200,
 *                                   parcela 4 de 6."
 *
 * Sem a segunda, a soma continuaria cega. Com ela, `ajuste_credito_manual` e `ajuste_debito_manual`
 * deixam de ser digitados e passam a ser a SOMA DOS ITENS — e a tela pode abrir a soma e mostrar de
 * onde cada centavo veio.
 *
 * `valor` no ITEM e COPIADO, nunca um apontamento vivo para a regra. Se o vale subir de R$ 300 para
 * R$ 350, as folhas ja fechadas continuam com R$ 300. E a mesma razao de
 * `contrato_parcelas.valor_previsto` e de `medicao.favorecido_chave_pix` existirem no fluxo de
 * contratos: o passado tem de continuar dizendo o que aconteceu, e nao o que a regra diz hoje.
 *
 * `parcela_numero` e DERIVADO na hora do calculo, nunca incrementado. A apuracao nasce RASCUNHO e
 * VAI SER RECALCULADA — a obra corrige um dia de falta e manda apurar de novo. Um contador que
 * incrementa a cada calculo faria o adiantamento de 6 parcelas acabar em 3 recalculos. E o mesmo
 * defeito que apareceu em 24/08 na cascata da medicao: O QUE E RECOMPUTACAO NAO PODE SER TRATADO
 * COMO EVENTO. Guardar o numero na linha serve para LER depois, nao para contar.
 *
 * `entra_no_liquido` existe por causa da resposta do cliente em 25/08: vale alimentacao e "um
 * credito pago a parte que pode ser recarregado no cartao ou pago diretamente ao colaborador".
 * Ou seja, ele NAO aumenta o liquido do salario — e um pagamento proprio. Se eu o somasse ao
 * liquido, o colaborador receberia o vale dentro do salario E a recarga do cartao pagaria de novo:
 * PAGAMENTO EM DOBRO. Mas ele E custo da obra e precisa aparecer no custo por obra (Fase 7).
 *
 * `forma` nasce so com VALOR_FIXO. Percentual e `base_percentual` NAO entram agora: o cliente
 * colocou a pensao alimenticia em standby, dizendo que e "um valor que vai ser informado no sistema
 * para reduzir o valor final". Sem percentual, some a dependencia de ordem entre descontos — que
 * era o risco de maior peso legal do desenho. Adiantar estrutura para um caso em standby e
 * construir complexidade sem cliente.
 *
 * SEM FK em `evento_recorrente_id`, `criado_por` e `solicitacao_id`, pela licao de 24/08: ao ligar
 * uma coluna a uma chave, a pergunta nao e so "quem le isto?" — e tambem "o que a chave passa a
 * impedir?". Aqui impediria desativar um evento que ja apareceu em folha, que e o caso comum.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria estrutura e NADA MAIS.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, 'rh_eventos_recorrentes'))) {
      await queryInterface.createTable('rh_eventos_recorrentes', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

        colaborador_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'rh_colaboradores', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        // VALE_ALIMENTACAO | VALE_TRANSPORTE | PLANO_SAUDE | DESCONTO_ADIANTAMENTO |
        // PENSAO_ALIMENTICIA | OUTRO
        codigo: { type: DataTypes.STRING(40), allowNull: false },
        // O nome que aparece na folha e na tela. Livre, porque OUTRO precisa se explicar.
        descricao: { type: DataTypes.STRING(160), allowNull: true },

        // CREDITO | DESCONTO
        natureza: { type: DataTypes.STRING(10), allowNull: false },
        // Por ora so VALOR_FIXO (ver cabecalho).
        forma: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'VALOR_FIXO' },
        valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },

        /**
         * `false` = pagamento a parte, nao mexe no liquido do salario (vale alimentacao).
         * `true`  = entra no calculo do que se paga (desconto de adiantamento, pensao, plano).
         */
        entra_no_liquido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

        // Competencia no formato YYYY-MM, igual `rh_apuracoes.competencia`.
        competencia_inicio: { type: DataTypes.STRING(7), allowNull: false },
        // Nulo = enquanto durar.
        competencia_fim: { type: DataTypes.STRING(7), allowNull: true },

        /**
         * Quantas vezes ao todo. NULO = indefinido (vale alimentacao, plano de saude).
         *
         * E o campo que justifica a tabela inteira: `parcelas_total = 6` e o sistema PARA SOZINHO na
         * sexta. Ninguem precisa lembrar de desligar — que e o pedido literal do cliente.
         */
        parcelas_total: { type: DataTypes.INTEGER, allowNull: true },

        // Desligar sem apagar: o historico da folha aponta para o evento.
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

        // O pedido que originou (tipo EVENTO_RECORRENTE). Sem FK (ver cabecalho).
        solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
        observacoes: { type: DataTypes.TEXT, allowNull: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },

        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });

      // "Quais eventos valem para este colaborador nesta competencia?" — a leitura do calculo.
      await queryInterface.addIndex('rh_eventos_recorrentes', ['colaborador_id', 'ativo', 'competencia_inicio'], {
        name: 'rh_eventos_recorrentes_colaborador_vigencia'
      });
    }

    if (!(await tableExists(sequelize, 'rh_apuracao_evento_itens'))) {
      await queryInterface.createTable('rh_apuracao_evento_itens', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

        apuracao_evento_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'rh_apuracao_eventos', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        // Nulo quando o item foi lancado a mao, sem regra por tras. Sem FK (ver cabecalho).
        evento_recorrente_id: { type: DataTypes.INTEGER, allowNull: true },

        codigo: { type: DataTypes.STRING(40), allowNull: false },
        descricao: { type: DataTypes.STRING(160), allowNull: true },
        natureza: { type: DataTypes.STRING(10), allowNull: false },

        // COPIADO da regra, nunca apontado. Ver cabecalho.
        valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        entra_no_liquido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

        // Guardado para LER ("parcela 4 de 6"), nunca para contar. Ver cabecalho.
        parcela_numero: { type: DataTypes.INTEGER, allowNull: true },
        parcelas_total: { type: DataTypes.INTEGER, allowNull: true },

        // RECORRENTE | MANUAL | PLANILHA
        origem: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'RECORRENTE' },
        observacoes: { type: DataTypes.TEXT, allowNull: true },

        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });

      await queryInterface.addIndex('rh_apuracao_evento_itens', ['apuracao_evento_id'], {
        name: 'rh_apuracao_evento_itens_evento'
      });

      // "Em quantas competencias este evento ja apareceu?" — a derivacao da parcela.
      await queryInterface.addIndex('rh_apuracao_evento_itens', ['evento_recorrente_id'], {
        name: 'rh_apuracao_evento_itens_recorrente'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: o item da folha e prova do que foi pago e descontado.
  }
};
