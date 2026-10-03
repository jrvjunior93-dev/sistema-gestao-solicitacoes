module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompraRespostaItem = sequelize.define(
    'SolicitacaoCompraRespostaItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      solicitacao_compra_fornecedor_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      item_tipo: {
        type: DataTypes.STRING,
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
      disponivel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      preco: {
        type: DataTypes.DECIMAL(22, 10),
        allowNull: true
      },
      prazo: {
        type: DataTypes.STRING,
        allowNull: true
      },
      observacao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      quantidade_minima_item: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: true
      },
      quantidade_disponivel: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: true
      },
      escopo_disponibilidade: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ACUMULADA'
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
      frete_valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      status_disponibilidade: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      data_chegada: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      vencedor: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compra_resposta_itens',
      timestamps: true
    }
  );

  return SolicitacaoCompraRespostaItem;
};
