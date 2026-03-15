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
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      nome_manual: {
        type: DataTypes.STRING,
        allowNull: false
      },
      unidade_sigla_manual: {
        type: DataTypes.STRING,
        allowNull: false
      },
      quantidade: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
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
      }
    },
    {
      tableName: 'solicitacao_compra_itens_manuais',
      timestamps: true
    }
  );

  return SolicitacaoCompraItemManual;
};
