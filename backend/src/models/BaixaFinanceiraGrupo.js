module.exports = (sequelize, DataTypes) => sequelize.define('BaixaFinanceiraGrupo', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(50), allowNull: false },
  idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
  tipo: { type: DataTypes.STRING(20), allowNull: false },
  empresa_id: { type: DataTypes.INTEGER, allowNull: false },
  parceiro_id: { type: DataTypes.INTEGER, allowNull: false },
  data_movimento: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONFIRMADO' },
  estornos_cheques: { type: DataTypes.JSON, allowNull: true },
  valor_principal: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  valor_quitacao: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: true },
  estornado_por: { type: DataTypes.INTEGER, allowNull: true },
  estornado_em: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'baixas_financeiras_grupos',
  timestamps: true
});
