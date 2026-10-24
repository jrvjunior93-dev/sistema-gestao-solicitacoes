module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoEnvioRetirada', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  chave: { type: DataTypes.STRING(64), allowNull: false },
  pedido_hash: { type: DataTypes.STRING(64), allowNull: false },
  resultado: { type: DataTypes.JSON, allowNull: false }
}, { tableName: 'pagamento_envios_retiradas', timestamps: true,
  indexes: [{ name: 'pagamento_retirada_usuario_chave', unique: true, fields: ['usuario_id', 'chave'] }] });
