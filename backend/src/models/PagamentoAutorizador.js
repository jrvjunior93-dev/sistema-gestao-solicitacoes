module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoAutorizador', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  piloto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  limite_por_lote: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  configurado_por: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'pagamento_autorizadores', timestamps: true });
