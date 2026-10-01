module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoAutorizacaoEvento', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  lote_id: { type: DataTypes.INTEGER, allowNull: false },
  item_id: { type: DataTypes.INTEGER, allowNull: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: true },
  tipo: { type: DataTypes.STRING(60), allowNull: false },
  dados_json: { type: DataTypes.JSON, allowNull: true },
  hash_anterior: { type: DataTypes.STRING(64), allowNull: true },
  evento_hash: { type: DataTypes.STRING(64), allowNull: false }
}, { tableName: 'pagamento_autorizacao_eventos', timestamps: true });
