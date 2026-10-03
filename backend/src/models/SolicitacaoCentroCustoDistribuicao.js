module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoCentroCustoDistribuicao', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  solicitacao_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  centro_custo_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  obra_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  abrangencia: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'OBRA'
  },
  criterio: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  percentual: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: false
  },
  valor_distribuido: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  criado_por: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'solicitacao_centro_custo_distribuicoes',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['solicitacao_id', 'obra_id'] },
    { fields: ['centro_custo_id', 'createdAt'] },
    { fields: ['obra_id', 'createdAt'] }
  ]
});
