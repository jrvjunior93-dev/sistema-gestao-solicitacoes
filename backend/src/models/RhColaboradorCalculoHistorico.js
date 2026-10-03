module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhColaboradorCalculoHistorico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
    forma_calculo: { type: DataTypes.STRING(20), allowNull: false },
    valor_diaria: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    pagamento_automatico_40_60: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },
    alterado_por: { type: DataTypes.INTEGER, allowNull: true }
  },
  { tableName: 'rh_colaborador_calculo_historicos', timestamps: true }
);
