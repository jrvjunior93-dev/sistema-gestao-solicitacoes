module.exports = (sequelize, DataTypes) => sequelize.define('WebPushSubscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  endpoint_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  endpoint: { type: DataTypes.TEXT, allowNull: false },
  p256dh: { type: DataTypes.TEXT, allowNull: false },
  auth: { type: DataTypes.TEXT, allowNull: false },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'web_push_subscriptions', timestamps: true });
