module.exports = (sequelize, DataTypes) => sequelize.define(
  'ComercialContratoImportacaoLinha',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    importacao_id: { type: DataTypes.INTEGER, allowNull: false },
    aba: { type: DataTypes.STRING(40), allowNull: false },
    numero_linha: { type: DataTypes.INTEGER, allowNull: false },
    chave_importacao: { type: DataTypes.STRING(120), allowNull: false },
    fingerprint: { type: DataTypes.STRING(64), allowNull: true },
    payload_json: { type: DataTypes.TEXT('long'), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'VALIDO' },
    erros_json: { type: DataTypes.TEXT('long'), allowNull: true },
    avisos_json: { type: DataTypes.TEXT('long'), allowNull: true }
  },
  { tableName: 'comercial_contrato_importacao_linhas', timestamps: true }
);
