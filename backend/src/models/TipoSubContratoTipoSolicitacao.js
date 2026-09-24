module.exports = (sequelize, DataTypes) => sequelize.define('TipoSubContratoTipoSolicitacao', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tipo_sub_contrato_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipo_solicitacao_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'tipos_sub_contrato_tipos_solicitacao',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['tipo_sub_contrato_id', 'tipo_solicitacao_id'] },
    { fields: ['tipo_solicitacao_id'] }
  ]
});
