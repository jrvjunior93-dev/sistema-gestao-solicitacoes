module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhColaboradorSalario',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
    valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    // Nulo = e o salario de hoje.
    vigencia_fim: { type: DataTypes.DATEONLY, allowNull: true },
    // CARGA_INICIAL | ADMISSAO | ALTERACAO | AJUSTE
    motivo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ALTERACAO' },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
    observacoes: { type: DataTypes.TEXT, allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: true }
  },
  { tableName: 'rh_colaborador_salarios', timestamps: true }
);
