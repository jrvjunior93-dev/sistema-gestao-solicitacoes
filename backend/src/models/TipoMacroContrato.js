module.exports = (sequelize, DataTypes) => {
  const TipoMacroContrato = sequelize.define(
    'TipoMacroContrato',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nome: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'tipos_macro_contrato',
      timestamps: true
    }
  );

  return TipoMacroContrato;
};
