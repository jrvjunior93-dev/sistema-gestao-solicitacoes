module.exports = (sequelize, DataTypes) => sequelize.define('RhTicketLote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  competencia: { type: DataTypes.STRING(7), allowNull: false },
  idempotency_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  empresa_grupo_id: { type: DataTypes.INTEGER, allowNull: false },
  parceiro_id: { type: DataTypes.INTEGER, allowNull: false },
  categoria_financeira_id: { type: DataTypes.INTEGER, allowNull: false },
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },
  valor_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'SOLICITADO' },
  criado_por: { type: DataTypes.INTEGER, allowNull: true },
  atualizado_por: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'rh_ticket_lotes', timestamps: true });
