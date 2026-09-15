module.exports = (sequelize, DataTypes) => sequelize.define(
  'ComercialContratoImportacao',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(50), allowNull: false },
    template_version: { type: DataTypes.STRING(20), allowNull: false },
    arquivo_nome: { type: DataTypes.STRING(255), allowNull: false },
    arquivo_hash: { type: DataTypes.STRING(64), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(180), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PREVIEW' },
    total_contratos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_unidades: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_parcelas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_recebimentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_erros: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_avisos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    valor_contratos: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    valor_saldo: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    valor_recebido_principal: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    erros_json: { type: DataTypes.TEXT('long'), allowNull: true },
    avisos_json: { type: DataTypes.TEXT('long'), allowNull: true },
    falha_mensagem: { type: DataTypes.TEXT, allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: false },
    confirmado_por: { type: DataTypes.INTEGER, allowNull: true },
    expira_em: { type: DataTypes.DATE, allowNull: false },
    confirmado_em: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'comercial_contrato_importacoes', timestamps: true }
);
