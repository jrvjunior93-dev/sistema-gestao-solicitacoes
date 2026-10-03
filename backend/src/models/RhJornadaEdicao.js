module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhJornadaEdicao',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    importacao_linha_id: { type: DataTypes.INTEGER, allowNull: false },
    obra_id: { type: DataTypes.INTEGER, allowNull: false },
    colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
    competencia: { type: DataTypes.STRING(7), allowNull: false },
    periodicidade: { type: DataTypes.STRING(15), allowNull: false },
    periodo_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    periodo_fim: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
    motivo: { type: DataTypes.TEXT, allowNull: false },
    motivo_decisao: { type: DataTypes.TEXT, allowNull: true },
    solicitada_por: { type: DataTypes.INTEGER, allowNull: false },
    solicitada_em: { type: DataTypes.DATE, allowNull: false },
    decidida_por: { type: DataTypes.INTEGER, allowNull: true },
    decidida_em: { type: DataTypes.DATE, allowNull: true },
    utilizada_em: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'rh_jornada_edicoes', timestamps: true }
);
