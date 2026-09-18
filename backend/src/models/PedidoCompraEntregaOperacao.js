module.exports = (sequelize, DataTypes) => sequelize.define('PedidoCompraEntregaOperacao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: DataTypes.STRING(120), unique: true, allowNull: false },
  pedido_compra_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  payload_hash: { type: DataTypes.STRING(64), allowNull: false },
  resultado: { type: DataTypes.JSON, allowNull: false }
}, { tableName: 'pedido_compra_entrega_operacoes', timestamps: true });
