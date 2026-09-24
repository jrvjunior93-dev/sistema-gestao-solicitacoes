module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompraItem = sequelize.define(
    'SolicitacaoCompraItem',
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
      status_aprovacao: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      insumo_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      unidade_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      unidade_sigla_manual: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      quantidade: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      valor_unitario: {
        type: DataTypes.DECIMAL(14, 2),
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
      frete_valor: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      especificacao: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      necessario_para: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      link_produto: {
        type: DataTypes.STRING,
        allowNull: true
      },
      arquivo_url: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      arquivo_nome_original: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compra_itens',
      timestamps: true
    }
  );

  return SolicitacaoCompraItem;
};
