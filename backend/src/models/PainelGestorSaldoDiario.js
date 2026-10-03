module.exports = (sequelize, DataTypes) => sequelize.define(
  'PainelGestorSaldoDiario',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    conta_bancaria_id: { type: DataTypes.INTEGER, allowNull: false },
    empresa_id: { type: DataTypes.INTEGER, allowNull: true },
    data_referencia: { type: DataTypes.DATEONLY, allowNull: false },
    saldo_disponivel: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    corrigido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ultima_justificativa: { type: DataTypes.TEXT, allowNull: true },
    informado_por: { type: DataTypes.INTEGER, allowNull: true },
    atualizado_por: { type: DataTypes.INTEGER, allowNull: true }
  },
  {
    tableName: 'painel_gestor_saldos_diarios',
    timestamps: true,
    indexes: [
      { name: 'uq_painel_gestor_saldo_conta_data', unique: true, fields: ['conta_bancaria_id', 'data_referencia'] }
    ]
  }
);
