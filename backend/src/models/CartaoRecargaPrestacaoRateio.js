module.exports = (sequelize, DataTypes) => sequelize.define('CartaoRecargaPrestacaoRateio', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  prestacao_id: { type: DataTypes.INTEGER, allowNull: false },
  obra_id: { type: DataTypes.INTEGER, allowNull: false },
  apropriacao_id: { type: DataTypes.INTEGER, allowNull: false },
  valor_rateio: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  percentual: { type: DataTypes.DECIMAL(10, 6), allowNull: false },
  criado_por: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'cartoes_recarga_prestacao_rateios',
  timestamps: true
});
