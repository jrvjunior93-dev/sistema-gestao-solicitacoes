'use strict';

const { tableExists } = require('../src/database/schemaUtils');

/**
 * OS DOCUMENTOS QUE ACOMPANHAM O PEDIDO DE PESSOAL (Fase 3 do modulo DP, 25/08).
 *
 * POR QUE UMA TABELA, e nao gravar direto em `rh_documentos`.
 *
 * `rh_documentos.colaborador_id` e obrigatorio — e na ADMISSAO o colaborador AINDA NAO EXISTE: ele
 * so nasce quando o DP aprova (Fase 2). **Nao da para anexar o RG de alguem que ainda nao e
 * ninguem.**
 *
 * A alternativa era criar o colaborador ja na abertura, com status `EM_ADMISSAO`, e aprovar so
 * mudaria para `ATIVO`. Foi descartada por dois motivos, e o segundo e o que decide:
 *
 * 1. admissao pode ser RECUSADA. Cada recusa deixaria uma pessoa meio-cadastrada no sistema,
 *    entrando em contagem, em busca e em relatorio. A Fase 1 acabou de mostrar o preco de dado que
 *    nao deveria estar la — 136 colaboradores sem obra ja sujam o custo por obra;
 * 2. **o CPF e unico** (`assertUniqueColaborador`). O provisorio prenderia o CPF, e o REENVIO do
 *    proprio pedido falharia — sendo que reenviar depois de corrigir e exatamente o que a Fase 2
 *    garantiu que funciona. O caminho "mais simples" quebraria o caminho principal.
 *
 * Entao o anexo vive no PEDIDO enquanto o pedido vive, e na aprovacao da admissao ele e COPIADO
 * para `rh_documentos` do colaborador recem-criado. Nos outros tipos (troca de obra, demissao) o
 * colaborador ja existe e a copia acontece do mesmo jeito, na aprovacao.
 *
 * `documento_tipo_id` e ANULAVEL: nem todo anexo e um documento tipado. Uma foto do acordo, um
 * comprovante avulso — vale anexar sem classificar. A conferencia do que falta so olha os tipados.
 *
 * `documento_gerado_id` guarda para qual `rh_documentos` este anexo virou. E o que impede a
 * aprovacao de duplicar documento se rodar duas vezes: quem ja gerou, nao gera de novo. A Fase 2
 * ja recusa aprovar duas vezes, mas defesa de dinheiro e de dado nao se apoia numa camada so.
 *
 * SEM FK em `documento_gerado_id` e `criado_por`, pela licao de 24/08: ao ligar uma coluna a uma
 * chave, a pergunta nao e so "quem le isto?" — e tambem "o que a chave passa a impedir?".
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`. Cria estrutura e NADA MAIS.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'rh_solicitacao_anexos')) return;

    await queryInterface.createTable('rh_solicitacao_anexos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'rh_solicitacoes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Nulo = anexo avulso, sem classificacao. A conferencia do que falta ignora estes.
      documento_tipo_id: { type: DataTypes.INTEGER, allowNull: true },

      nome_original: { type: DataTypes.STRING(255), allowNull: false },
      arquivo_url: { type: DataTypes.TEXT, allowNull: false },
      mimetype: { type: DataTypes.STRING(120), allowNull: true },
      tamanho_bytes: { type: DataTypes.INTEGER, allowNull: true },
      validade: { type: DataTypes.DATEONLY, allowNull: true },
      observacoes: { type: DataTypes.TEXT, allowNull: true },

      // Para qual `rh_documentos` este anexo virou, na aprovacao. Nulo enquanto nao virou.
      documento_gerado_id: { type: DataTypes.INTEGER, allowNull: true },

      criado_por: { type: DataTypes.INTEGER, allowNull: true },

      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });

    // "Quais anexos deste pedido?" — a leitura da tela do pedido e da conferencia do que falta.
    await queryInterface.addIndex('rh_solicitacao_anexos', ['solicitacao_id', 'documento_tipo_id'], {
      name: 'rh_solicitacao_anexos_pedido_tipo'
    });
  },

  async down() {
    // Sem rollback destrutivo: o anexo e prova do que foi entregue no pedido.
  }
};
