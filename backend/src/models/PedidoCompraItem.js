module.exports = (sequelize, DataTypes) => {
  const PedidoCompraItem = sequelize.define(
    'PedidoCompraItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      pedido_compra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      resposta_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true
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
      descricao: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      unidade: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      quantidade_solicitada: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0
      },
      quantidade_minima_item: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: true
      },
      quantidade_pedido: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0
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
      valor_mercadoria: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      ipi_valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      icms_valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      st_valor: {
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
      removido: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      quantidade_cancelada: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0
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
      },
      origem: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'COTACAO'
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'pedido_compra_itens',
      timestamps: true
    }
  );

  return PedidoCompraItem;
};
