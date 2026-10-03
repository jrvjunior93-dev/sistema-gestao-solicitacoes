module.exports = (sequelize, DataTypes) => sequelize.define('PedidoCompraItemRecebimento', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pedido_compra_item_id: { type: DataTypes.INTEGER, allowNull: false },
  quantidade: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  recebido_em: { type: DataTypes.DATE, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  observacao: { type: DataTypes.TEXT, allowNull: true },
  idempotency_key: { type: DataTypes.STRING(120), allowNull: false, unique: true }
}, {
  tableName: 'pedido_compra_item_recebimentos',
  timestamps: true
});
