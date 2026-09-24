module.exports = (sequelize, DataTypes) => sequelize.define(
  'PainelGestorSaldoHistorico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    saldo_diario_id: { type: DataTypes.INTEGER, allowNull: false },
    conta_bancaria_id: { type: DataTypes.INTEGER, allowNull: false },
    data_referencia: { type: DataTypes.DATEONLY, allowNull: false },
    saldo_anterior: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    saldo_novo: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    acao: { type: DataTypes.STRING(20), allowNull: false },
    justificativa: { type: DataTypes.TEXT, allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true }
  },
  {
    tableName: 'painel_gestor_saldos_historicos',
    timestamps: true
  }
);
