module.exports = (sequelize, DataTypes) => sequelize.define(
  'PedidoCompraReabertura',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pedido_compra_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
    motivo: { type: DataTypes.TEXT, allowNull: false },
    status_pedido_snapshot: { type: DataTypes.STRING(40), allowNull: false },
    status_financeiro_snapshot: { type: DataTypes.STRING(40), allowNull: true },
    financeiro_snapshot: { type: DataTypes.JSON, allowNull: true },
    solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
    solicitado_em: { type: DataTypes.DATE, allowNull: false },
    decidido_por: { type: DataTypes.INTEGER, allowNull: true },
    decidido_em: { type: DataTypes.DATE, allowNull: true },
    motivo_decisao: { type: DataTypes.TEXT, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(100), allowNull: true }
  },
  { tableName: 'pedido_compra_reaberturas', timestamps: true }
);
