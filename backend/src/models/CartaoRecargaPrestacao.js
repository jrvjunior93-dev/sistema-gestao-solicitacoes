module.exports = (sequelize, DataTypes) => sequelize.define('CartaoRecargaPrestacao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  solicitacao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
  valor_base: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
  motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },
  enviado_por: { type: DataTypes.INTEGER, allowNull: true },
  enviado_em: { type: DataTypes.DATE, allowNull: true },
  validado_por: { type: DataTypes.INTEGER, allowNull: true },
  validado_em: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'cartoes_recarga_prestacoes',
  timestamps: true
});
