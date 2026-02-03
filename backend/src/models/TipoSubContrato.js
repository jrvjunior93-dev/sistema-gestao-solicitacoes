module.exports = (sequelize, DataTypes) => {
  const TipoSubContrato = sequelize.define(
    'TipoSubContrato',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      tipo_macro_id: {
        type: DataTypes.INTEGER,
        allowNull: false
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
      tableName: 'tipos_sub_contrato',
      timestamps: true
    }
  );

  return TipoSubContrato;
};
