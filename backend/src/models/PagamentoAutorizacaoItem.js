module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoAutorizacaoItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lote_id: { type: DataTypes.INTEGER, allowNull: false },
  titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDENTE' },
  valor_snapshot: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  vencimento_snapshot: { type: DataTypes.DATEONLY, allowNull: true },
  snapshot_json: { type: DataTypes.JSON, allowNull: false },
  snapshot_hash: { type: DataTypes.STRING(64), allowNull: false },
  motivo_decisao: { type: DataTypes.STRING(500), allowNull: true },
  decidido_em: { type: DataTypes.DATE, allowNull: true },
  fila_item_id: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'pagamento_autorizacao_itens', timestamps: true });
