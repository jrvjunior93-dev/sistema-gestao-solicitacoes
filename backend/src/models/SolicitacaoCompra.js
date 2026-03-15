module.exports = (sequelize, DataTypes) => {
  const SolicitacaoCompra = sequelize.define(
    'SolicitacaoCompra',
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
      solicitante_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      solicitacao_principal_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ABERTA'
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      necessario_para: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      link_geral: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'solicitacao_compras',
      timestamps: true
    }
  );

  return SolicitacaoCompra;
};
