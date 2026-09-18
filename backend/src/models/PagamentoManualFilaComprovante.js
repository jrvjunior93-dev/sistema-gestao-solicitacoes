module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoManualFilaComprovante', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fila_id: { type: DataTypes.INTEGER, allowNull: false },
  nome: { type: DataTypes.STRING(255), allowNull: false },
  url: { type: DataTypes.TEXT, allowNull: false },
  hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  banco: { type: DataTypes.STRING(40), allowNull: true },
  tipo: { type: DataTypes.STRING(40), allowNull: true },
  identificador: { type: DataTypes.STRING(160), allowNull: true },
  dados_json: { type: DataTypes.JSON, allowNull: true },
  vinculado_por: { type: DataTypes.INTEGER, allowNull: true },
  vinculado_em: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'pagamentos_manuais_fila_comprovantes', timestamps: true });
