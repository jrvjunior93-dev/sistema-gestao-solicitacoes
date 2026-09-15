module.exports = (sequelize, DataTypes) => sequelize.define(
  'ContratoComercialUnidade',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    contrato_comercial_id: { type: DataTypes.INTEGER, allowNull: false },
    unidade_comercial_id: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    valor_cadastro_referencia: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    valor_atribuido: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    confirmado_por: { type: DataTypes.INTEGER, allowNull: true },
    confirmado_em: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'contrato_comercial_unidades', timestamps: true }
);
