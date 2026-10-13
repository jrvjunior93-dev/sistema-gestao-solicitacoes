module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoFilaLiquidacao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  idempotency_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  request_hash: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONFIRMADO' },
  dados: { type: DataTypes.JSON, allowNull: false },
  criado_por: { type: DataTypes.INTEGER, allowNull: false },
  estornado_por: { type: DataTypes.INTEGER, allowNull: true },
  estornado_em: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'pagamento_fila_liquidacoes', timestamps: true });
