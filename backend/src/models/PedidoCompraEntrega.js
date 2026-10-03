module.exports = (sequelize, DataTypes) => sequelize.define('PedidoCompraEntrega', {
  pedido_compra_item_id: { type: DataTypes.INTEGER, primaryKey: true },
  pedido_compra_id: { type: DataTypes.INTEGER, allowNull: false },
  previsao: DataTypes.DATEONLY,
  estado: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'OBRA' },
  prazo_compras: DataTypes.DATEONLY,
  saldo_cancelado: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'pedido_compra_entregas', timestamps: true });
