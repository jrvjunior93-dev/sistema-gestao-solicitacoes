module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhFechamentoTitulo',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    fechamento_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    apuracao_evento_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    titulo_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tipo_titulo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'INTEGRAL'
    },
    evento_recorrente_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    valor_gerado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    }
  },
  {
    tableName: 'rh_fechamento_titulos',
    timestamps: true
  }
);
