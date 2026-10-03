module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoAutorizacaoDocumento', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  item_id: { type: DataTypes.INTEGER, allowNull: false },
  origem_tipo: { type: DataTypes.STRING(40), allowNull: false },
  origem_id: { type: DataTypes.INTEGER, allowNull: true },
  nome: { type: DataTypes.STRING(255), allowNull: false },
  arquivo_url_snapshot: { type: DataTypes.TEXT, allowNull: false },
  arquivo_hash: { type: DataTypes.STRING(64), allowNull: true }
}, { tableName: 'pagamento_autorizacao_documentos', timestamps: true });
