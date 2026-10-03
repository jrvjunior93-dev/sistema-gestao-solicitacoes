module.exports = (sequelize, DataTypes) => sequelize.define('CentroCustoTipoSolicitacao', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  centro_custo_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipo_solicitacao_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  criado_por: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  atualizado_por: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'centro_custo_tipos_solicitacao',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['centro_custo_id', 'tipo_solicitacao_id'] },
    { fields: ['centro_custo_id', 'ativo'] }
  ]
});
