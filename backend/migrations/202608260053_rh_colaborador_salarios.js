'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * HISTORICO DE SALARIO DO COLABORADOR (Fase 5 do modulo DP, 26/08).
 *
 * MESMO PROBLEMA DA OBRA, MESMA SOLUCAO. `rh_colaboradores.salario_base` e uma coluna so: aprovar um
 * aumento REESCREVE o presente e APAGA o passado. "Quanto ele ganhava em marco?" deixa de ter
 * resposta no minuto em que o salario muda.
 *
 * Alguem pode objetar que a folha ja guarda: `rh_apuracao_eventos.valor_base_calculo` copia o
 * salario de cada competencia. Mas isso so cobre os meses que TIVERAM folha. Colaborador admitido em
 * marco cuja primeira folha e de junho nao tem como dizer quanto ganhava em abril — e e justamente
 * em periodo sem folha fechada que alguem vai querer conferir.
 *
 * `rh_colaboradores.salario_base` CONTINUA existindo e continua sendo o salario corrente: e o que a
 * apuracao, as telas e os relatorios ja leem. Esta tabela e o historico ao lado dele, alimentada
 * quando a Diretoria aprova a alteracao.
 *
 * A ESTRUTURA E DELIBERADAMENTE IGUAL A DE `rh_colaborador_vinculos`: `vigencia_inicio`,
 * `vigencia_fim` nulo para o vigente, e o anterior fechado no DIA ANTERIOR do novo. Igual de
 * proposito — quem entender uma entende a outra, e a aritmetica ja esta provada por 13 conferencias
 * na suite 49. Inventar um segundo formato de vigencia no mesmo modulo seria criar duas regras para
 * a mesma pergunta.
 *
 * `solicitacao_id` liga a mudanca ao pedido que a autorizou. E o que responde "quem aprovou este
 * aumento?" — que, sendo decisao de Diretoria, e a pergunta mais provavel sobre esta tabela.
 *
 * SEM FK em `solicitacao_id` e `criado_por`, pela licao de 24/08.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria estrutura e NADA MAIS. Registros
 * anteriores nao recebem carga automatica; o historico passa a ser gravado pelas operacoes da
 * interface.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'rh_colaborador_salarios')) return;

    await queryInterface.createTable('rh_colaborador_salarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      colaborador_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'rh_colaboradores', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },

      vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      // NULO = e o salario de hoje.
      vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },

      // CARGA_INICIAL | ADMISSAO | ALTERACAO | AJUSTE
      motivo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ALTERACAO' },

      // O pedido que autorizou. Sem FK (ver cabecalho).
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
      observacoes: { type: DataTypes.TEXT, allowNull: true },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },

      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    // "Quanto ele ganhava naquela data?" — a leitura do historico.
    await queryInterface.addIndex('rh_colaborador_salarios', ['colaborador_id', 'vigencia_inicio'], {
      name: 'rh_salarios_colaborador_inicio'
    });

    // "Qual o salario vigente?" — a pergunta mais frequente.
    await queryInterface.addIndex('rh_colaborador_salarios', ['colaborador_id', 'vigencia_fim'], {
      name: 'rh_salarios_colaborador_vigente'
    });
  },

  async down() {
    // Sem rollback destrutivo: o historico de salario E o registro.
  }
};
