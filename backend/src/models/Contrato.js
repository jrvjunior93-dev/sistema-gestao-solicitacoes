module.exports = (sequelize, DataTypes) => {
  const Contrato = sequelize.define(
    'Contrato',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      codigo: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ref_contrato: {
        type: DataTypes.STRING,
        allowNull: true
      },
      descricao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      itens_apropriacao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      valor_total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true
      },
      ajuste_solicitado: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0
      },
      ajuste_pago: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0
      },
      tipo_macro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      tipo_sub_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Por que a contratacao esta sendo feita (escopo 3.1/3.2).
      justificativa: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Quem RECEBE o pagamento (PI-12). Pode ser terceiro, fora dos contratados.
      favorecido_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      // ── Fluxo novo de contratos ───────────────────────────────────────────
      // Separa os contratos do fluxo novo dos legados. Default false: contrato
      // sem marcacao segue o fluxo antigo de solicitacao.
      fluxo_novo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status_contrato: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      // PI-16: a solicitacao unica deste contrato. O estado vive nela; `status_contrato` passou a
      // ser espelho. Nulo nos 335 legados, que nunca tiveram solicitacao-mae.
      solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      objeto: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      detalhes_contratacao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Fotografia dos dados do representante informados na abertura. Nao aponta diretamente
      // para `parceiros`: o cadastro pode mudar, mas o dossie submetido ao Juridico nao.
      representante_legal_qualificacao: {
        type: DataTypes.JSON,
        allowNull: true
      },
      vigencia_inicio: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      vigencia_fim: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      responsavel_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      forma_pagamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      qtde_parcelas: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Escolhida na criacao a partir da lista curada em Configuracoes.
      // Nullable pelos 335 contratos legados; exigida so no fluxo novo.
      categoria_financeira_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Acumulado de aditivos. O teto de 25% incide sobre a soma, nao por aditivo.
      valor_aditivos: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      // De onde o contrato foi devolvido: `APROVACAO` ou `JURIDICO`. E o que diz ao reenvio para
      // onde voltar — devolvido pelo Juridico volta ao Juridico, nao ao inicio da fila.
      rejeitado_na_etapa: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      // Link da plataforma de assinatura, entregue pelo Juridico junto com a minuta (20/08).
      // Anulavel: contrato que circula em papel nao tem link.
      link_assinatura: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      aprovado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      aprovado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      rejeitado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      rejeitado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      motivo_rejeicao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // A classificacao operacional continua calculada em tempo real. Estes campos registram
      // somente o ato explicito de rescisao e o saldo cancelado naquele instante.
      rescindido_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      rescindido_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      motivo_rescisao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      saldo_rescindido: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
      }
    },
    {
      tableName: 'contratos',
      timestamps: true
    }
  );

  return Contrato;
};
