module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompraItemManual = sequelize.define(
    'SolicitacaoCompraItemManual',
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
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      nome_manual: {
        type: DataTypes.STRING,
        allowNull: false
      },
      unidade_sigla_manual: {
        type: DataTypes.STRING,
        allowNull: true
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
        allowNull: true
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
      },
      insumo_catalogado_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      catalogado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      catalogado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      catalogacao_tipo: {
        type: DataTypes.STRING(20),
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compra_itens_manuais',
      timestamps: true
    }
  );

  return SolicitacaoCompraItemManual;
};
