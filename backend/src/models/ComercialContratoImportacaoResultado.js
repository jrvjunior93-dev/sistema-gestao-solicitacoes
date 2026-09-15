module.exports = (sequelize, DataTypes) => sequelize.define(
  'ComercialContratoImportacaoResultado',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    importacao_id: { type: DataTypes.INTEGER, allowNull: false },
    chave_importacao: { type: DataTypes.STRING(120), allowNull: false },
    contrato_comercial_id: { type: DataTypes.INTEGER, allowNull: false },
    status_resultado: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CRIADO' },
    parceiros_ids_json: { type: DataTypes.TEXT, allowNull: true },
    unidades_ids_json: { type: DataTypes.TEXT, allowNull: true },
    parcelas_ids_json: { type: DataTypes.TEXT('long'), allowNull: true },
    titulos_ids_json: { type: DataTypes.TEXT('long'), allowNull: true },
    movimentos_ids_json: { type: DataTypes.TEXT('long'), allowNull: true }
  },
  { tableName: 'comercial_contrato_importacao_resultados', timestamps: true }
);
