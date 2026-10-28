module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompraAlocacao = sequelize.define(
    'SolicitacaoCompraAlocacao',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      solicitacao_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      fechamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      resposta_item_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      fornecedor_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      item_tipo: {
        type: DataTypes.STRING(40),
        allowNull: false
      },
      solicitacao_compra_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      solicitacao_compra_item_manual_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      quantidade_alocada: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0
      },
      quantidade_referencia: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: true
      },
      preco_unitario: {
        type: DataTypes.DECIMAL(22, 10),
        allowNull: false,
        defaultValue: 0
      },
      valor_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      desconto_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      ipi_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      icms_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      st_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      difal_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      frete_rateado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ATIVA'
      },
      status_financeiro: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'PREVISTO'
      },
      titulo_financeiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      valor_realizado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      realizado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      pedido_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      pedido_compra_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      criado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cancelado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cancelado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      motivo_cancelamento: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compra_alocacoes',
      timestamps: true
    }
  );

  return SolicitacaoCompraAlocacao;
};
