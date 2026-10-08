module.exports = (sequelize, DataTypes) => sequelize.define('PagamentoAutorizacaoLote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AGUARDANDO' },
  modo: { type: DataTypes.STRING(20), allowNull: false },
  valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  quantidade_itens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  dossie_hash: { type: DataTypes.STRING(64), allowNull: false },
  revisao_autorizacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  idempotency_key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: false },
  decidido_por: { type: DataTypes.INTEGER, allowNull: true },
  decidido_em: { type: DataTypes.DATE, allowNull: true },
  expira_em: { type: DataTypes.DATE, allowNull: false },
  observacao: { type: DataTypes.STRING(500), allowNull: true }
}, { tableName: 'pagamento_autorizacao_lotes', timestamps: true });
